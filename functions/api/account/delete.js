import { json, err, getUser, verifyPassword, purgeUser, ADMIN_USERNAME } from "../_utils.js";

// POST /api/account/delete — a user erasing their own account.
// Body: { password } — re-entered so a borrowed session can't delete an account.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  // The admin account can't be deleted through the app: losing it would lock the
  // site's only moderator out with no way back in.
  if (user.is_admin || (user.username || "").toLowerCase() === ADMIN_USERNAME)
    return err("The admin account can't be deleted here.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const password = String(body.password || "");
  if (!password) return err("Enter your password to confirm.");
  if (!(await verifyPassword(password, user.password_hash)))
    return err("That password isn't right.", 401);

  await purgeUser(env, user);

  return json({ deleted: true });
}
