import { json, err, verifyPassword, signToken, publicUser, todayStr } from "./_utils.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return err("Username and password are required.");

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?")
    .bind(username).first();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return err("Incorrect username or password.", 401);

  // apply daily reset on login too
  const today = todayStr();
  if (user.last_reset_date !== today) {
    await env.DB.prepare(
      "UPDATE users SET daily_codes_used = 0, bonus_unlocked_today = 0, bonus_timer_start = NULL, last_reset_date = ? WHERE id = ?"
    ).bind(today, user.id).run();
    user.daily_codes_used = 0; user.bonus_unlocked_today = 0; user.bonus_timer_start = null;
  }

  const token = await signToken(env, user.id);
  return json({ token, user: publicUser(user) });
}
