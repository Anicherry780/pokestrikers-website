// GET /api/latest-video — newest *regular* upload from the PokeStrikers channel
// (no API key needed; Workers can fetch cross-origin).
//
// Livestreams and premieres are deliberately skipped. A scheduled stream sits at
// the top of the RSS feed but never fires the player's ENDED event, so the bonus
// code could never unlock. Anything that is or was a live broadcast is rejected.
const CHANNEL_ID = "UCGJnR3Eky-tBz4TPGUs-S-A";
const FALLBACK_VIDEO = "cgPvGAPyzlA"; // known regular upload, used if nothing else qualifies
const MAX_CANDIDATES = 4;             // keep subrequests bounded

// Markers found in the watch page for streams/premieres. "isLiveContent" is also
// true for finished VODs of past streams, which is intended — only ordinary
// uploads are eligible.
const LIVE_MARKERS = ['"isUpcoming":true', '"isLiveNow":true', '"isLiveContent":true'];

async function isRegularVideo(id) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      cf: { cacheTtl: 1800, cacheEverything: true },
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return false;
    const html = await res.text();
    return !LIVE_MARKERS.some((m) => html.includes(m));
  } catch {
    return false; // unreachable/unknown: treat as ineligible rather than risk a stream
  }
}

export async function onRequestGet() {
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

      for (const id of ids) {
        if (await isRegularVideo(id)) { videoId = id; source = "feed"; break; }
      }
    }
  } catch {
    // keep fallback
  }

  // Short browser cache on purpose. The costly part (the feed + watch-page
  // lookups) is cached at the edge for 30 min via cf.cacheTtl, so re-running
  // this is cheap — but a long client cache would pin a viewer to a stale
  // video id, which is how a livestream stuck around after being filtered out.
  return new Response(JSON.stringify({ videoId, channelId: CHANNEL_ID, source }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
