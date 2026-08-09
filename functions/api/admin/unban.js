import { json, err } from "../_utils.js";
import { requireAdmin } from "./_admin.js";
import { findUser } from "./ban.js";

// POST /api/admin/unban — Body: { username } or { id }
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const target = await findUser(env, body);
  if (!target) return err("No such account.", 404);

  try {
    await env.DB.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(target.id).run();
  } catch {
    return err("Unbanning needs the is_banned column. Run: ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;", 503);
  }
  return json({ banned: false, username: target.username, id: target.id });
}
