import { json, err, getUser, nowIso } from "./_utils.js";

async function packFromBody(request) {
  let body;
  try { body = await request.json(); } catch { return null; }
  const pack = String(body.pack_name || "").trim();
  return pack && pack.length <= 60 ? pack : null;
}

// GET /api/subscriptions — the sets this user follows.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  const { results } = await env.DB.prepare(
    "SELECT pack_name FROM subscriptions WHERE username = ? ORDER BY pack_name"
  ).bind(user.username).all();

  return json({ packs: (results || []).map((r) => r.pack_name) });
}

// POST /api/subscriptions — follow a set. Body: { pack_name }
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  const pack = await packFromBody(request);
  if (!pack) return err("A valid pack_name is required.");

  await env.DB.prepare(
    "INSERT OR IGNORE INTO subscriptions (username, pack_name, created_at) VALUES (?, ?, ?)"
  ).bind(user.username, pack, nowIso()).run();

  return json({ subscribed: true, pack_name: pack });
}

// DELETE /api/subscriptions — unfollow a set. Body: { pack_name }
export async function onRequestDelete({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  const pack = await packFromBody(request);
  if (!pack) return err("A valid pack_name is required.");

  await env.DB.prepare("DELETE FROM subscriptions WHERE username = ? AND pack_name = ?")
    .bind(user.username, pack).run();

  return json({ subscribed: false, pack_name: pack });
}
