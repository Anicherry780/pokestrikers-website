import { json, err, getUser, verifyPayload } from "../_utils.js";

// A viewer can pause or buffer, so require slightly less than the full runtime.
const REQUIRED_FRACTION = 0.9;
// Tickets go stale so one can't be minted, kept, and replayed days later.
const TICKET_TTL_MS = 6 * 60 * 60 * 1000;

// POST /api/bonus/unlock — called when the embedded video reaches its end.
// Body: { ticket } from GET /api/bonus/ticket.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  // Already unlocked: nothing to check, and re-running should stay harmless.
  if (user.bonus_unlocked_today) return json({ unlocked: true, already: true });

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const data = await verifyPayload(env, body.ticket);
  if (!data || data.uid !== user.id)
    return err("Start the video again — we couldn't verify this session.", 400);

  const elapsed = Date.now() - Number(data.iat || 0);
  if (elapsed < 0 || elapsed > TICKET_TTL_MS)
    return err("That watch session expired. Play the video again to unlock.", 400);

  // secs === 0 means we couldn't read the runtime; fall back to a floor rather
  // than trusting an unknown-length video.
  const required = (Number(data.secs) > 0 ? Number(data.secs) : 60) * REQUIRED_FRACTION * 1000;
  if (elapsed < required) {
    const left = Math.ceil((required - elapsed) / 1000);
    return err(`Keep watching — about ${left}s to go before the bonus unlocks.`, 425);
  }

  await env.DB.prepare("UPDATE users SET bonus_unlocked_today = 1 WHERE id = ?")
    .bind(user.id).run();

  return json({ unlocked: true });
}
