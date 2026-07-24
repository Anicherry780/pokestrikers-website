import { json, err, getUser, nowIso, CODE_REGEX, isUsed, notifySubscribers } from "../_utils.js";

// POST /api/codes/upload — any logged-in user adds a code.
export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err("Not authenticated.", 401);

  let body;
  try { body = await request.json(); } catch { return err("Invalid request body"); }

  const code = String(body.code || "").trim().toUpperCase();
  let packName = String(body.pack_name || "").trim();

  if (!CODE_REGEX.test(code))
    return err("Code must be in the format XXX-XXXX-XXX-XXX (letters and numbers).");

  // Checked before the duplicate lookup so a claimed/expired code reports as
  // burned rather than as a duplicate. Still catches it after cleanup deletes the row.
  if (await isUsed(env, code)) return err("This code has already been used.", 409);

  const dup = await env.DB.prepare("SELECT id FROM codes WHERE code = ?").bind(code).first();
  if (dup) return err("That code has already been uploaded.", 409);

  if (!packName) packName = "Random Pack";
  if (packName.length > 60) packName = packName.slice(0, 60);

  await env.DB.prepare(
    `INSERT INTO codes (code, pack_name, uploaded_by, uploaded_at, status)
     VALUES (?, ?, ?, ?, 'available')`
  ).bind(code, packName, user.id, nowIso()).run();

  const notified = await notifySubscribers(env, packName, user.username);

  return json({ success: true, code, pack_name: packName, notified }, 201);
}
