import { json, err } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// POST /api/admin/ban — Body: { username } or { id }
// Banning also kills any session the user already holds: getUser() rejects a
// banned account on every request, so their existing token stops working at once.
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const target = await findUser(env, body);
  if (!target) return err("No such account.", 404);
  if (target.is_admin) return err("The admin account can't be banned.", 403);

  try {
    await env.DB.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").bind(target.id).run();
  } catch {
    return err("Banning needs the is_banned column. Run: ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;", 503);
  }
  return json({ banned: true, username: target.username, id: target.id });
}

export async function findUser(env, body) {
  const id = parseInt(body.id, 10);
  if (id) return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();

  const username = String(body.username || "").trim();
  if (!username) return null;
  return env.DB.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username).first();
}
