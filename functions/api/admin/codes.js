import { json, err, sweepExpired, nowIso, CODE_REGEX } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

// GET /api/admin/codes — list every code with uploader/claimer usernames.
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);
  await sweepExpired(env);

  const { results } = await env.DB.prepare(
    `SELECT c.*, u1.username AS uploader, u2.username AS claimer
       FROM codes c
       LEFT JOIN users u1 ON u1.id = c.uploaded_by
       LEFT JOIN users u2 ON u2.id = c.claimed_by
      ORDER BY c.id DESC`
  ).all();

  const counts = await env.DB.prepare(
    `SELECT
       SUM(status = 'available') AS available,
       SUM(status = 'claimed')   AS claimed,
       SUM(status = 'expired')   AS expired,
       COUNT(*) AS total
     FROM codes`
  ).first();

  return json({ codes: results, counts });
}

// POST /api/admin/codes — bulk upload. Body: { codes: [{code, pack_name}, ...] } or { text: "..." }
export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return err("Admin access required.", 403);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  let items = [];
  if (Array.isArray(body.codes)) {
    items = body.codes.map((c) => ({
      code: String(c.code || "").trim().toUpperCase(),
      pack_name: String(c.pack_name || "").trim() || "Random Pack",
    }));
  } else if (typeof body.text === "string") {
    // One per line. Optional "CODE, Pack Name" or "CODE | Pack Name".
    items = body.text.split(/\r?\n/).map((line) => {
      const parts = line.split(/[,|\t]/);
      return {
        code: String(parts[0] || "").trim().toUpperCase(),
        pack_name: String(parts[1] || "").trim() || "Random Pack",
      };
    }).filter((x) => x.code);
  } else {
    return err("Provide 'codes' array or 'text'.");
  }

  const added = [], skipped = [];
  for (const it of items) {
    if (!CODE_REGEX.test(it.code)) { skipped.push({ code: it.code, reason: "bad format" }); continue; }
    const dup = await env.DB.prepare("SELECT id FROM codes WHERE code = ?").bind(it.code).first();
    if (dup) { skipped.push({ code: it.code, reason: "duplicate" }); continue; }
    await env.DB.prepare(
      "INSERT INTO codes (code, pack_name, uploaded_by, uploaded_at, status) VALUES (?, ?, ?, ?, 'available')"
    ).bind(it.code, it.pack_name, admin.id, nowIso()).run();
    added.push(it.code);
  }

  return json({ added: added.length, skipped, added_codes: added }, 201);
}
