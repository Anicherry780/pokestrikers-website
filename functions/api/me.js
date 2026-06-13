import { json, err, getUser, publicUser, dailyAllowance, sweepExpired } from "./_utils.js";

// GET /api/me — current user state + available-code count (used by dashboard).
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);
  const avail = await env.DB.prepare("SELECT COUNT(*) AS n FROM codes WHERE status = 'available'").first();

  return json({
    user: publicUser(user),
    allowance: dailyAllowance(user),
    available_codes: avail.n,
  });
}
