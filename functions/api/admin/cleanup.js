import { json, err, sweepExpired, nowIso, DAY_MS } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// GET /api/admin/cleanup — drop expired codes that were uploaded more than 24h
// ago. Every code is copied into used_codes first, so deleting the row here
// never lets the code back into the vault. The admin panel calls this on load.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  await sweepExpired(env);

  const cutoff = new Date(Date.now() - DAY_MS).toISOString();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO used_codes (code, used_at)
       SELECT code, ? FROM codes WHERE status = 'expired' AND uploaded_at < ?`
  ).bind(nowIso(), cutoff).run();

  const res = await env.DB.prepare(
    "DELETE FROM codes WHERE status = 'expired' AND uploaded_at < ?"
  ).bind(cutoff).run();

  return json({ deleted: res.meta.changes || 0, cutoff });
}
