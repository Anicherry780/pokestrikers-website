import { json, err, getUser, signPayload } from "../_utils.js";
import { resolveBonusVideo } from "../_video.js";

// GET /api/bonus/ticket — issued when the dashboard mounts the bonus video.
// The signed ticket records which video was served, how long it runs, and when
// the clock started. /api/bonus/unlock will not grant the bonus until at least
// that much real time has passed, so the unlock can no longer be had by simply
// POSTing to it from the console.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  const { videoId, seconds, source } = await resolveBonusVideo(env);

  const ticket = await signPayload(env, {
    uid: user.id,
    vid: videoId,
    secs: seconds,
    iat: Date.now(),
  });

  return json({ ticket, videoId, seconds, source }, 200, { "Cache-Control": "no-store" });
}
