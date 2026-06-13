import { json, err } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// GET /api/admin/users — list all users with their code-claim activity.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const { results } = await env.DB.prepare(
    `SELECT u.id, u.username, u.is_admin, u.created_at,
            u.daily_codes_used, u.bonus_unlocked_today, u.last_reset_date,
            (SELECT COUNT(*) FROM codes WHERE uploaded_by = u.id) AS uploaded,
            (SELECT COUNT(*) FROM codes WHERE claimed_by  = u.id) AS claimed
       FROM users u
      ORDER BY u.id DESC`
  ).all();

  return json({ users: results });
}
