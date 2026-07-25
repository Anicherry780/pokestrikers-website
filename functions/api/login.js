import {
  json, err, verifyPassword, signToken, publicUser, applyWindowReset,
  loginLockout, recordLoginFailure, clearLoginFailures,
} from "./_utils.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return err("Username and password are required.");

  // Throttle before doing any password work, so a locked account is also cheap
  // to reject and can't be used to burn CPU.
  const locked = await loginLockout(env, username);
  if (locked) {
    const mins = Math.max(1, Math.ceil(locked / 60000));
    return err(`Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`, 429);
  }

  // NOCASE so "pokestrikers" logs into the "PokeStrikers" account. Safe because
  // registration forbids case-variants, so this can match at most one row.
  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username).first();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    // Only counted for real accounts — see recordLoginFailure. The message stays
    // identical either way so it can't be used to enumerate usernames.
    if (user) await recordLoginFailure(env, user.username);
    return err("Incorrect username or password.", 401);
  }

  await clearLoginFailures(env, user.username);

  // apply the 24h window reset on login too
  await applyWindowReset(user, env);

  const token = await signToken(env, user.id);
  return json({ token, user: publicUser(user) });
}
