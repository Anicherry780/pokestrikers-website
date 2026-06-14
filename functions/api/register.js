import { json, err, hashPassword, signToken, nowIso, publicUser, ADMIN_USERNAME } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return err("Username must be 3–20 characters (letters, numbers, underscore).");
  if (password.length < 6)
    return err("Password must be at least 6 characters.");

  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username).first();
  if (exists) return err("That username is already taken.", 409);

  const isAdmin = username.toLowerCase() === ADMIN_USERNAME ? 1 : 0;
  const hash = await hashPassword(password);

  // last_reset_date stays NULL until the user's first claim starts the 24h window.
  const res = await env.DB.prepare(
    `INSERT INTO users (username, password_hash, is_admin, created_at, daily_codes_used, last_reset_date, bonus_unlocked_today)
     VALUES (?, ?, ?, ?, 0, NULL, 0)`
  ).bind(username, hash, isAdmin, nowIso()).run();

  const id = res.meta.last_row_id;
  const token = await signToken(env, id);
  const user = { id, username, is_admin: isAdmin, daily_codes_used: 0, bonus_unlocked_today: 0, last_reset_date: null };
  return json({ token, user: publicUser(user) }, 201);
}
