import { json, err, verifyPassword, signToken, publicUser, applyWindowReset } from "./_utils.js";

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

  // apply the 24h window reset on login too
  await applyWindowReset(user, env);

  const token = await signToken(env, user.id);
  return json({ token, user: publicUser(user) });
}
