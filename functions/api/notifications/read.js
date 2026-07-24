import { json, err, getUser } from "../_utils.js";

// POST /api/notifications/read — mark notifications read.
// Body is optional: { id } marks one, no body marks them all.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  let id = null;
  try {
    const body = await request.json();
    if (body && body.id) id = parseInt(body.id, 10) || null;
  } catch { /* no body — mark everything */ }

  const res = id
    ? await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE username = ? AND id = ?")
        .bind(user.username, id).run()
    : await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE username = ? AND is_read = 0")
        .bind(user.username).run();

  return json({ marked: res.meta.changes || 0 });
}
