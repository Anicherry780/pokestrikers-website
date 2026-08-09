import {
  json, err, getUser, dailyAllowance, sweepExpired, nowIso, resetAt, markUsed,
  clientIp, claimIpKey, reserveIpSlot, releaseIpSlot, MAX_CLAIMS_PER_IP_PER_DAY,
  CLAIM_WINDOW_MS, DAY_MS,
} from "../_utils.js";

// GET /api/codes/claim — assign a random available code to the user.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);

  const allowance = dailyAllowance(user);
  const hadWindow = !!user.last_reset_date;
  const windowStart = user.last_reset_date || nowIso();

  // Reserve the quota slot up front with a conditional UPDATE. Checking the
  // count and incrementing it separately let two concurrent requests both pass
  // the check and both claim, so a second browser tab bought a free extra code.
  // `changes === 0` means someone else took the last slot first.
  const reserved = await env.DB.prepare(
    `UPDATE users
        SET daily_codes_used = daily_codes_used + 1,
            last_reset_date  = COALESCE(last_reset_date, ?)
      WHERE id = ? AND daily_codes_used < ?`
  ).bind(windowStart, user.id, allowance).run();

  if (!reserved.meta.changes) {
    const msg = user.bonus_unlocked_today
      ? "You've claimed your maximum of 2 codes. Come back when your 24h cooldown ends!"
      : "You've used your free code. Watch the full PokeStrikers video to unlock a 2nd code!";
    return json({ error: msg, reset_at: resetAt(user) }, 429);
  }

  // Hand the slot back if we can't actually deliver a code. If this claim also
  // started the 24h window, clear that too — otherwise a failed claim would put
  // the user on cooldown having received nothing.
  const ip = clientIp(request);
  const ipKey = claimIpKey(ip);

  const releaseSlot = async () => {
    await env.DB.prepare(
      hadWindow
        ? "UPDATE users SET daily_codes_used = daily_codes_used - 1 WHERE id = ? AND daily_codes_used > 0"
        : "UPDATE users SET daily_codes_used = daily_codes_used - 1, last_reset_date = NULL WHERE id = ? AND daily_codes_used > 0"
    ).bind(user.id).run();
    await releaseIpSlot(env, ipKey);
  };

  // Per-IP daily cap, on top of the per-account one. The account limit alone was
  // trivially beaten by registering more accounts; this counts codes leaving the
  // vault to one location no matter how many accounts are behind it.
  if (!(await reserveIpSlot(env, ipKey, MAX_CLAIMS_PER_IP_PER_DAY))) {
    await env.DB.prepare(
      hadWindow
        ? "UPDATE users SET daily_codes_used = daily_codes_used - 1 WHERE id = ? AND daily_codes_used > 0"
        : "UPDATE users SET daily_codes_used = daily_codes_used - 1, last_reset_date = NULL WHERE id = ? AND daily_codes_used > 0"
    ).bind(user.id).run();
    return json({
      error: "This location has already claimed its codes for today. Try again tomorrow!",
      reset_at: resetAt(user),
    }, 429);
  }

  // Optional pack filter (?pack=...). Empty/"Random Pack" means any pack.
  const url = new URL(request.url);
  const pack = (url.searchParams.get("pack") || "").trim();

  let code;
  if (pack && pack !== "Random Pack") {
    code = await env.DB.prepare(
      "SELECT * FROM codes WHERE status = 'available' AND pack_name = ? ORDER BY RANDOM() LIMIT 1"
    ).bind(pack).first();
    if (!code) {
      await releaseSlot();
      return err(`No codes available for "${pack}" right now. Try another set!`, 404);
    }
  } else {
    code = await env.DB.prepare(
      "SELECT * FROM codes WHERE status = 'available' ORDER BY RANDOM() LIMIT 1"
    ).first();
    if (!code) {
      await releaseSlot();
      return err("No codes are available right now. Check back soon — or upload one yourself!", 404);
    }
  }

  const now = Date.now();
  const claimedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CLAIM_WINDOW_MS).toISOString();

  // Atomic claim: only succeeds if still available (guards against double-claim races).
  const upd = await env.DB.prepare(
    "UPDATE codes SET status = 'claimed', claimed_by = ?, claimed_at = ?, expires_at = ? WHERE id = ? AND status = 'available'"
  ).bind(user.id, claimedAt, expiresAt, code.id).run();

  if (!upd.meta.changes) {
    // Someone grabbed it first; hand the slot back and ask the client to retry.
    await releaseSlot();
    return err("That code was just taken — try again.", 409);
  }

  // Burned the moment it is handed out, so it can never be re-uploaded.
  await markUsed(env, code.code);

  // The quota was already incremented by the reservation above.
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
