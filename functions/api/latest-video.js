// GET /api/latest-video — returns the newest video id from the PokeStrikers
// channel RSS feed (no API key needed; Workers can fetch cross-origin).
const CHANNEL_ID = "UCGJnR3Eky-tBz4TPGUs-S-A";
const FALLBACK_VIDEO = "cgPvGAPyzlA"; // used if the feed can't be reached

export async function onRequestGet() {
  let videoId = FALLBACK_VIDEO;
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
      { cf: { cacheTtl: 1800, cacheEverything: true } }
    );
    if (res.ok) {
      const xml = await res.text();
      const m = xml.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/);
      if (m) videoId = m[1];
    }
  } catch {
    // keep fallback
  }
  return new Response(JSON.stringify({ videoId, channelId: CHANNEL_ID }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
