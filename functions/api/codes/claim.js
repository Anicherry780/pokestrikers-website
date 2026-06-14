import { json, err, getUser, dailyAllowance, sweepExpired, nowIso, resetAt, CLAIM_WINDOW_MS, DAY_MS } from "../_utils.js";

// GET /api/codes/claim — assign a random available code to the user.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);

  const allowance = dailyAllowance(user);
  if (user.daily_codes_used >= allowance) {
    const msg = user.bonus_unlocked_today
      ? "You've claimed your maximum of 2 codes. Come back when your 24h cooldown ends!"
      : "You've used your free code. Watch the full PokeStrikers video to unlock a 2nd code!";
    return json({ error: msg, reset_at: resetAt(user) }, 429);
  }

  // Optional pack filter (?pack=...). Empty/"Random Pack" means any pack.
  const url = new URL(request.url);
  const pack = (url.searchParams.get("pack") || "").trim();

  let code;
  if (pack && pack !== "Random Pack") {
    code = await env.DB.prepare(
      "SELECT * FROM codes WHERE status = 'available' AND pack_name = ? ORDER BY RANDOM() LIMIT 1"
    ).bind(pack).first();
    if (!code) return err(`No codes available for "${pack}" right now. Try another set!`, 404);
  } else {
    code = await env.DB.prepare(
      "SELECT * FROM codes WHERE status = 'available' ORDER BY RANDOM() LIMIT 1"
    ).first();
    if (!code) return err("No codes are available right now. Check back soon — or upload one yourself!", 404);
  }

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

  // Start the 24h window on the first claim; keep it on subsequent claims.
  const windowStart = user.last_reset_date || claimedAt;
  if (user.last_reset_date) {
    await env.DB.prepare("UPDATE users SET daily_codes_used = daily_codes_used + 1 WHERE id = ?")
      .bind(user.id).run();
  } else {
    await env.DB.prepare("UPDATE users SET daily_codes_used = daily_codes_used + 1, last_reset_date = ? WHERE id = ?")
      .bind(windowStart, user.id).run();
  }

  const reset_at = new Date(new Date(windowStart).getTime() + DAY_MS).toISOString();

  return json({
    code: code.code,
    pack_name: code.pack_name || "Random Pack",
    expires_at: expiresAt,
    window_ms: CLAIM_WINDOW_MS,
    daily_codes_used: user.daily_codes_used + 1,
    allowance,
    reset_at,
  });
}
