import { json, err, getUser, BONUS_WAIT_MS } from "../_utils.js";

// GET /api/bonus/check-timer — poll countdown; unlocks the bonus code once 10 min have passed.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  if (user.bonus_unlocked_today)
    return json({ unlocked: true, remaining_ms: 0 });

  if (!user.bonus_timer_start)
    return json({ unlocked: false, started: false, remaining_ms: BONUS_WAIT_MS });

  const elapsed = Date.now() - new Date(user.bonus_timer_start).getTime();
  const remaining = Math.max(0, BONUS_WAIT_MS - elapsed);

  if (remaining <= 0) {
    await env.DB.prepare("UPDATE users SET bonus_unlocked_today = 1 WHERE id = ?")
      .bind(user.id).run();
    return json({ unlocked: true, remaining_ms: 0 });
  }
  return json({ unlocked: false, started: true, remaining_ms: remaining });
}
