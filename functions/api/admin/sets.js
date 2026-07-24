import { json, err, nowIso } from "../_utils.js";
import { requireAdmin } from "./_admin.js";

const MAX_LENGTH = 60;

async function nameFromBody(request) {
  let body;
  try { body = await request.json(); } catch { return null; }
  const name = String(body.name || "").replace(/\s+/g, " ").trim();
  return name && name.length <= MAX_LENGTH ? name : null;
}

// POST /api/admin/sets — add a set. Body: { name }
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const name = await nameFromBody(request);
  if (!name) return err(`Give the set a name (up to ${MAX_LENGTH} characters).`);

  const dup = await env.DB.prepare("SELECT name FROM sets WHERE name = ? COLLATE NOCASE")
    .bind(name).first();
  if (dup) return err("That set has already been added.", 409);

  await env.DB.prepare("INSERT INTO sets (name, created_at) VALUES (?, ?)")
    .bind(name, nowIso()).run();

  return json({ name, added: true }, 201);
}

// DELETE /api/admin/sets — remove an admin-added set. Body: { name }
// Built-in sets live in the client list and cannot be removed here.
export async function onRequestDelete({ request, env }) {
  if (!(await requireAdmin(request, env))) return err("Admin access required.", 403);

  const name = await nameFromBody(request);
  if (!name) return err("Which set should be removed?");

  const res = await env.DB.prepare("DELETE FROM sets WHERE name = ? COLLATE NOCASE")
    .bind(name).run();
  if (!res.meta.changes) return err("That set isn't one of the added ones.", 404);

  return json({ name, removed: true });
}
