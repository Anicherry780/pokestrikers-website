// GET /api/latest-video — which video gates the bonus code.
//
// Order of preference:
//   1. A video the admin pinned (settings.bonus_video_id). This wins outright —
//      it is the only way to guarantee a watchable, appropriate video.
//   2. Newest entry from the channel feed that is not a scheduled or in-progress
//      broadcast (those never fire the player's ENDED event, so the bonus could
//      never unlock). Videos of 2min+ are preferred over Shorts, but a Short is
//      accepted rather than serving nothing.
//   3. A hardcoded fallback.
const CHANNEL_ID = "UCGJnR3Eky-tBz4TPGUs-S-A";
const FALLBACK_VIDEO = "cgPvGAPyzlA";
const MAX_CANDIDATES = 15;   // the feed carries ~15 entries
const PREFERRED_SECONDS = 120;

// Present only while a broadcast is scheduled or running. Deliberately excludes
// "isLiveContent", which stays true forever on a finished stream's VOD — those
// are fine, since they end normally.
const LIVE_MARKERS = ['"isUpcoming":true', '"isLiveNow":true'];

async function inspect(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      cf: { cacheTtl: 1800, cacheEverything: true },
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (LIVE_MARKERS.some((m) => html.includes(m))) return null;
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return { id, seconds: m ? parseInt(m[1], 10) : 0 };
  } catch {
    return null;
  }
}

async function pinnedVideo(env) {
  // Guarded: if the settings table hasn't been created yet, fall through to the
  // feed rather than 500ing the bonus card.
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'bonus_video_id'"
    ).first();
    return row && row.value ? row.value : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ env }) {
  const pinned = await pinnedVideo(env);
  if (pinned) return respond(pinned, "pinned");

  let videoId = FALLBACK_VIDEO;
  let source = "fallback";

  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
      { cf: { cacheTtl: 1800, cacheEverything: true } }
    );
    if (res.ok) {
      const xml = await res.text();
      const ids = [...xml.matchAll(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/g)]
        .map((m) => m[1])
        .slice(0, MAX_CANDIDATES);

      let firstUsable = null;
      for (const id of ids) {
        const info = await inspect(id);
        if (!info) continue;
        if (!firstUsable) firstUsable = info;
        if (info.seconds >= PREFERRED_SECONDS) { firstUsable = info; break; }
      }
      if (firstUsable) { videoId = firstUsable.id; source = "feed"; }
    }
  } catch {
    // keep fallback
  }

  return respond(videoId, source);
}

function respond(videoId, source) {
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
