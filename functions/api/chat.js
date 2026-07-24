import { json, err, getUser, nowIso } from "./_utils.js";

const PAGE_SIZE = 50;
const MAX_LENGTH = 300;
const COOLDOWN_MS = 3000;   // per-user gap between messages

// Unanchored twin of CODE_REGEX. Separators are normalised first so
// "ABC 1234 XYZ 999" and "ABC.1234.XYZ.999" are caught alongside the dashed form.
const CODE_ANYWHERE = /[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}/;

export function looksLikeCode(text) {
  const normalised = String(text).toUpperCase().replace(/[\s._|]+/g, "-");
  return CODE_ANYWHERE.test(normalised);
}

// GET /api/chat[?since=<id>] — public. Newest PAGE_SIZE messages, oldest first;
// with ?since only messages after that id, so the client can poll cheaply.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

  const { results } = since
    ? await env.DB.prepare(
        `SELECT m.id, m.username, m.body, m.created_at, COALESCE(u.is_admin, 0) AS is_admin
           FROM messages m
           LEFT JOIN users u ON u.username = m.username COLLATE NOCASE
          WHERE m.id > ? ORDER BY m.id ASC LIMIT ?`
      ).bind(since, PAGE_SIZE).all()
    : await env.DB.prepare(
        `SELECT * FROM (
           SELECT m.id, m.username, m.body, m.created_at, COALESCE(u.is_admin, 0) AS is_admin
             FROM messages m
             LEFT JOIN users u ON u.username = m.username COLLATE NOCASE
            ORDER BY m.id DESC LIMIT ?
         ) ORDER BY id ASC`
      ).bind(PAGE_SIZE).all();

  return json({ messages: results || [] });
}

// POST /api/chat — logged-in only. Body: { body: "..." }
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Log in to join the chat.", 401);

  let payload;
  try { payload = await request.json(); } catch { return err("Invalid request body"); }

  const body = String(payload.body || "").replace(/\s+/g, " ").trim();
  if (!body) return err("Type a message first.");
  if (body.length > MAX_LENGTH) return err(`Keep it under ${MAX_LENGTH} characters.`);

  // Codes belong in the vault, not the chat: posting one here would bypass the
  // claim limit, the cooldown and the used_codes ledger entirely.
  if (looksLikeCode(body))
    return err("Please don't post codes in chat — upload it to the vault so it's shared fairly.", 422);

  const last = await env.DB.prepare(
    "SELECT created_at FROM messages WHERE username = ? ORDER BY id DESC LIMIT 1"
  ).bind(user.username).first();

  if (last) {
    const gap = Date.now() - new Date(last.created_at).getTime();
    if (gap >= 0 && gap < COOLDOWN_MS) return err("Slow down a second.", 429);
  }

  const created = nowIso();
  const res = await env.DB.prepare(
    "INSERT INTO messages (username, body, created_at) VALUES (?, ?, ?)"
  ).bind(user.username, body, created).run();

  return json({
    message: {
      id: res.meta.last_row_id,
      username: user.username,
      body,
      created_at: created,
      is_admin: user.is_admin ? 1 : 0,
    },
  }, 201);
}
