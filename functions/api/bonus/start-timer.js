import { json, err, getUser, nowIso, BONUS_WAIT_MS, dailyAllowance } from "../_utils.js";

// POST /api/bonus/start-timer — begins the 10-minute "watched a video" countdown.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  if (user.bonus_unlocked_today)
    return json({ unlocked: true, remaining_ms: 0 });

  // If a timer is already running, don't restart it.
  let start = user.bonus_timer_start;
  if (!start) {
    start = nowIso();
    await env.DB.prepare("UPDATE users SET bonus_timer_start = ? WHERE id = ?")
      .bind(start, user.id).run();
  }

  const elapsed = Date.now() - new Date(start).getTime();
  const remaining = Math.max(0, BONUS_WAIT_MS - elapsed);
  return json({ unlocked: false, remaining_ms: remaining, wait_ms: BONUS_WAIT_MS, started_at: start });
}
