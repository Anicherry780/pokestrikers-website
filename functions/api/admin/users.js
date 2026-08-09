import { json, err, purgeUser } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// GET /api/admin/users — list all users with their code-claim activity.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.is_admin, u.created_at,
            u.daily_codes_used, u.bonus_unlocked_today, u.last_reset_date,
            COALESCE(u.is_banned, 0) AS is_banned,
            COALESCE(u.ip_address, '') AS ip_address,
            (SELECT COUNT(*) FROM codes WHERE uploaded_by = u.id) AS uploaded,
            (SELECT COUNT(*) FROM codes WHERE claimed_by  = u.id) AS claimed
       FROM users u
      ORDER BY u.id DESC`
  ).all();

  return json({ users: results });
}

// DELETE /api/admin/users — erase a user on their behalf. Body: { id }
// This is how a "please delete my data" email gets actioned for someone who
// can't log in themselves.
export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const id = parseInt(body.id, 10);
  if (!id) return err("Which account should be removed?");

  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!target) return err("No such account.", 404);
  if (target.is_admin) return err("The admin account can't be deleted.", 403);

  await purgeUser(env, target);

  return json({ deleted: true, username: target.username });
}
