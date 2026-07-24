import { json, err, getUser, sweepExpired } from "./_utils.js";

// Claimed codes are shown back masked — the full code is only ever revealed in
// the 5-minute claim window, never in history.
const mask = (code) => `${String(code).slice(0, 3)}-XXXX-XXX-XXX`;

// GET /api/profile — everything the profile page renders for the current user.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);

  const totals = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM codes WHERE uploaded_by = ?) AS uploaded,
            (SELECT COUNT(*) FROM codes WHERE claimed_by  = ?) AS claimed`
  ).bind(user.id, user.id).first();

  const claimed = await env.DB.prepare(
    `SELECT code, pack_name, claimed_at FROM codes
      WHERE claimed_by = ? ORDER BY claimed_at DESC LIMIT 10`
  ).bind(user.id).all();

  const uploaded = await env.DB.prepare(
    `SELECT pack_name, status, uploaded_at FROM codes
      WHERE uploaded_by = ? ORDER BY uploaded_at DESC LIMIT 10`
  ).bind(user.id).all();

  return json({
    username: user.username,
    member_since: user.created_at,
    totals: { uploaded: totals.uploaded || 0, claimed: totals.claimed || 0 },
    recent_claimed: (claimed.results || []).map((r) => ({
      code: mask(r.code),
      pack_name: r.pack_name || "Random Pack",
      claimed_at: r.claimed_at,
    })),
    recent_uploaded: (uploaded.results || []).map((r) => ({
      pack_name: r.pack_name || "Random Pack",
      status: r.status,
      uploaded_at: r.uploaded_at,
    })),
  });
}
