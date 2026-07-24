import { json, err, sweepExpired, CODE_REGEX } from "./_utils.js";

// GET /api/status?code=XXX-XXXX-XXX-XXX — public code lookup, no auth.
// Reports the live row if the code is still in the vault, otherwise falls back
// to used_codes (claimed/expired codes that cleanup has already removed).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "").trim().toUpperCase();

  if (!code) return err("Enter a code to check.");
  if (!CODE_REGEX.test(code))
    return err("Code must be in the format XXX-XXXX-XXX-XXX (letters and numbers).");

  await sweepExpired(env);

  const row = await env.DB.prepare(
    `SELECT c.code, c.pack_name, c.status, c.uploaded_at, c.claimed_at, c.expires_at,
            u.username AS claimer
       FROM codes c
       LEFT JOIN users u ON u.id = c.claimed_by
      WHERE c.code = ?`
  ).bind(code).first();

  if (row) {
    return json({
      found: true,
      code: row.code,
      status: row.status,                       // available | claimed | expired
      pack_name: row.pack_name || "Random Pack",
      uploaded_at: row.uploaded_at,
      claimed_at: row.claimed_at,
      claimer: row.claimer || null,
    });
  }

  const used = await env.DB.prepare("SELECT used_at FROM used_codes WHERE code = ?")
    .bind(code).first();
  if (used) return json({ found: true, code, status: "used", used_at: used.used_at });

  return json({ found: false, code, status: "not_found" });
}
