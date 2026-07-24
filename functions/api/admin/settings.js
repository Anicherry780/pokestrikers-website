import { json, err, nowIso } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// Accepts a bare id or any normal YouTube URL (watch, youtu.be, shorts, embed).
export function parseVideoId(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// GET /api/admin/settings — current pinned bonus video, if any.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const row = await env.DB.prepare("SELECT value, updated_at FROM settings WHERE key = 'bonus_video_id'").first();
  return json({
    bonus_video_id: row ? row.value : null,
    updated_at: row ? row.updated_at : null,
  });
}

// POST /api/admin/settings — pin a video, or clear it to fall back to the feed.
// Body: { bonus_video_id: "<id|url>" }  or  { bonus_video_id: "" } to clear.
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const raw = String(body.bonus_video_id ?? "").trim();

  if (!raw) {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'bonus_video_id'").run();
    return json({ bonus_video_id: null, cleared: true });
  }

  const id = parseVideoId(raw);
  if (!id) return err("That doesn't look like a YouTube video id or URL.");

  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('bonus_video_id', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(id, nowIso()).run();

  return json({ bonus_video_id: id, cleared: false });
}
