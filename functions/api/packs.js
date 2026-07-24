import { json, sweepExpired } from "./_utils.js";

// GET /api/packs — packs that currently have available codes, with counts and
// the most recent upload time. Public (like /api/stats): the dashboard set
// picker and the landing-page vault table both read it, and the landing page is
// shown to logged-out visitors. Only aggregate counts are exposed, no codes.
export async function onRequestGet({ env }) {
  await sweepExpired(env);
  const { results } = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(TRIM(pack_name), ''), 'Random Pack') AS pack_name,
            COUNT(*) AS count,
            MAX(uploaded_at) AS last_updated
       FROM codes
      WHERE status = 'available'
      GROUP BY pack_name
      ORDER BY count DESC, pack_name ASC`
  ).all();

  return json({ packs: results });
}
