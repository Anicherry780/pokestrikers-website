import { json, err } from "../_utils.js";
import { requireAdmin } from "../admin/_admin.js";

// DELETE /api/chat/:id — moderation. Admin only.
export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const id = parseInt(params.id, 10);
  if (!id) return err("Invalid message id.");

  const res = await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
  if (!res.meta.changes) return err("Message not found.", 404);

  return json({ success: true, deleted: id });
}
