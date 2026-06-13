import { json, err, getUser, dailyAllowance, sweepExpired, nowIso, CLAIM_WINDOW_MS } from "../_utils.js";

// GET /api/codes/claim — assign a random available code to the user.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);

  const allowance = dailyAllowance(user);
  if (user.daily_codes_used >= allowance) {
    if (!user.bonus_unlocked_today)
      return err("You've used your free code today. Watch a PokeStrikers video to unlock a 2nd code!", 429);
    return err("You've claimed your maximum of 2 codes today. Come back tomorrow!", 429);
  }

  // Pick a random available code.
  const code = await env.DB.prepare(
    "SELECT * FROM codes WHERE status = 'available' ORDER BY RANDOM() LIMIT 1"
  ).first();
  if (!code) return err("No codes are available right now. Check back soon — or upload one yourself!", 404);

  const now = Date.now();
  const claimedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CLAIM_WINDOW_MS).toISOString();

  // Atomic claim: only succeeds if still available (guards against double-claim races).
  const upd = await env.DB.prepare(
    "UPDATE codes SET status = 'claimed', claimed_by = ?, claimed_at = ?, expires_at = ? WHERE id = ? AND status = 'available'"
  ).bind(user.id, claimedAt, expiresAt, code.id).run();

  if (!upd.meta.changes) {
    // Someone grabbed it first; ask the client to retry.
    return err("That code was just taken — try again.", 409);
  }

  await env.DB.prepare("UPDATE users SET daily_codes_used = daily_codes_used + 1 WHERE id = ?")
    .bind(user.id).run();

  return json({
    code: code.code,
    pack_name: code.pack_name || "Random Pack",
    expires_at: expiresAt,
    window_ms: CLAIM_WINDOW_MS,
    daily_codes_used: user.daily_codes_used + 1,
    allowance,
  });
}
