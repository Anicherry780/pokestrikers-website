import { json, err, getUser, sweepExpired } from "./_utils.js";

// GET /api/packs — packs that currently have available codes, with counts.
// Used by the dashboard so users can pick which set to claim from.
export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  await sweepExpired(env);
  const { results } = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(TRIM(pack_name), ''), 'Random Pack') AS pack_name, COUNT(*) AS count
       FROM codes
      WHERE status = 'available'
      GROUP BY pack_name
      ORDER BY count DESC, pack_name ASC`
  ).all();

  return json({ packs: results });
}
