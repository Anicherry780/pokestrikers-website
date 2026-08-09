import {
  json, err, hashPassword, signToken, nowIso, publicUser, ADMIN_USERNAME,
  clientIp, regIpKey, reserveIpSlot, releaseIpSlot, MAX_ACCOUNTS_PER_IP_PER_DAY,
} from "./_utils.js";
import { screenUsername } from "./_profanity.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  // 3-20 chars, letters/numbers/underscore only. The character class also rules
  // out spaces and anything exotic.
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return err("Username must be 3-20 characters, using only letters, numbers and underscores.");
  if (password.length < 6)
    return err("Password must be at least 6 characters.");

  const flagged = screenUsername(username);
  if (flagged === "brand")
    return err("That username is reserved. Please choose a different username.", 409);
  if (flagged)
    return err("This username is not allowed. Please choose a different username.", 400);

  // COLLATE NOCASE: without it SQLite treats "Bob" and "bob" as different names,
  // which let anyone register a case-variant of an existing account.
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username).first();
  if (exists) return err("That username is already taken.", 409);

  // The admin name is reserved in every casing. Admin is granted by the is_admin
  // column only (see admin/_admin.js) and is never handed out at signup.
  if (username.toLowerCase() === ADMIN_USERNAME)
    return err("That username is reserved.", 409);

  // Caps how fast one person can farm throwaway accounts. Reserved before the
  // insert so concurrent signups can't overshoot the limit.
  const ip = clientIp(request);
  const ipKey = regIpKey(ip);
  if (!(await reserveIpSlot(env, ipKey, MAX_ACCOUNTS_PER_IP_PER_DAY)))
    return err("Too many accounts created from your location. Try again tomorrow.", 429);

  try {
    const hash = await hashPassword(password);

    // last_reset_date stays NULL until the user's first claim starts the 24h window.
    const res = await env.DB.prepare(
      `INSERT INTO users (username, password_hash, is_admin, created_at, daily_codes_used, last_reset_date, bonus_unlocked_today, ip_address)
       VALUES (?, ?, 0, ?, 0, NULL, 0, ?)`
    ).bind(username, hash, nowIso(), ip).run();

    const id = res.meta.last_row_id;
    const token = await signToken(env, id);
    const user = { id, username, is_admin: 0, daily_codes_used: 0, bonus_unlocked_today: 0, last_reset_date: null };
    return json({ token, user: publicUser(user) }, 201);
  } catch (e) {
    await releaseIpSlot(env, ipKey);   // signup failed, don't spend their allowance
    throw e;
  }
}
