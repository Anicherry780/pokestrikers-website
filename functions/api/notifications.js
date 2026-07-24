import { json, err, getUser } from "./_utils.js";

// GET /api/notifications — unread count + the 10 most recent, for the navbar bell.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE username = ? AND is_read = 0"
  ).bind(user.username).first();

  const { results } = await env.DB.prepare(
    `SELECT id, message, pack_name, is_read, created_at FROM notifications
      WHERE username = ? ORDER BY id DESC LIMIT 10`
  ).bind(user.username).all();

  return json({ unread: count.n || 0, notifications: results || [] });
}
