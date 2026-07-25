// Shared bonus-video resolution. Files starting with "_" are not routed.
// Used by /api/latest-video (what to embed) and /api/bonus/ticket (how long the
// viewer must actually watch before the bonus can unlock).

export const CHANNEL_ID = "UCGJnR3Eky-tBz4TPGUs-S-A";
export const FALLBACK_VIDEO = "cgPvGAPyzlA";
const MAX_CANDIDATES = 15;   // the feed carries ~15 entries
const PREFERRED_SECONDS = 120;

// Present only while a broadcast is scheduled or running. Deliberately excludes
// "isLiveContent", which stays true forever on a finished stream's VOD — those
// are fine, since they end normally.
const LIVE_MARKERS = ['"isUpcoming":true', '"isLiveNow":true'];

// Raw watch-page read. Returns { id, seconds, live } or null if unreachable.
export async function probe(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      cf: { cacheTtl: 1800, cacheEverything: true },
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return {
      id,
      seconds: m ? parseInt(m[1], 10) : 0,
      live: LIVE_MARKERS.some((x) => html.includes(x)),
    };
  } catch {
    return null;
  }
}

// Eligible for automatic selection: not a scheduled/running broadcast.
async function inspect(id) {
  const info = await probe(id);
  return info && !info.live ? info : null;
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

// Which video currently gates the bonus, and how long it runs.
// A pinned video wins outright — it is the admin's explicit choice.
export async function resolveBonusVideo(env) {
  const pinned = await pinnedVideo(env);
  if (pinned) {
    const info = await probe(pinned);
    return { videoId: pinned, source: "pinned", seconds: info ? info.seconds : 0 };
  }

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
      if (firstUsable) {
        return { videoId: firstUsable.id, source: "feed", seconds: firstUsable.seconds };
      }
    }
  } catch {
    // keep fallback
  }

  return { videoId: FALLBACK_VIDEO, source: "fallback", seconds: 0 };
}
