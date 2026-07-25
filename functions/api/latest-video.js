import { CHANNEL_ID, resolveBonusVideo } from "./_video.js";

// GET /api/latest-video — which video gates the bonus code.
//
// Order of preference:
//   1. A video the admin pinned (settings.bonus_video_id). This wins outright —
//      it is the only way to guarantee a watchable, appropriate video.
//   2. Newest entry from the channel feed that is not a scheduled or in-progress
//      broadcast (those never fire the player's ENDED event, so the bonus could
//      never unlock). Videos of 2min+ are preferred over Shorts.
//   3. A hardcoded fallback.
//
// Selection logic lives in _video.js so /api/bonus/ticket resolves the exact
// same video, and the same duration, as the one actually embedded.
export async function onRequestGet({ env }) {
  const { videoId, source } = await resolveBonusVideo(env);

  // Short browser cache on purpose: a long one pins viewers to a stale id, which
  // is how a filtered-out livestream stayed on screen. The costly YouTube
  // lookups are edge-cached separately via cf.cacheTtl.
  return new Response(JSON.stringify({ videoId, channelId: CHANNEL_ID, source }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
