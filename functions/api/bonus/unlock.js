import { json, err, getUser } from "../_utils.js";

// POST /api/bonus/unlock — called by the dashboard when the embedded PokeStrikers
// video finishes playing. Unlocks the user's 2nd (bonus) code for this window.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  if (!user.bonus_unlocked_today) {
    await env.DB.prepare("UPDATE users SET bonus_unlocked_today = 1 WHERE id = ?")
      .bind(user.id).run();
  }
  return json({ unlocked: true });
}
