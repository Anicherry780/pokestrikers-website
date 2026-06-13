import { json, err } from "../../_utils.js";
import { requireAdmin } from "../_admin.js";

// DELETE /api/admin/codes/:id
export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const id = parseInt(params.id, 10);
  if (!id) return err("Invalid code id.");

  const res = await env.DB.prepare("DELETE FROM codes WHERE id = ?").bind(id).run();
  if (!res.meta.changes) return err("Code not found.", 404);
  return json({ success: true, deleted: id });
}
