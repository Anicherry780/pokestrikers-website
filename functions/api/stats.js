import { json, sweepExpired } from "./_utils.js";

// GET /api/stats — public; used by the landing page (no auth).
export async function onRequestGet({ env }) {
  await sweepExpired(env);
  const avail = await env.DB.prepare("SELECT COUNT(*) AS n FROM codes WHERE status = 'available'").first();
  const users = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  return json({ available_codes: avail.n, total_users: users.n });
}
