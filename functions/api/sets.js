import { json } from "./_utils.js";

// GET /api/sets — admin-added set names, newest first. The client merges these
// on top of the built-in POKE_PACKS list, so a missing table just means "no
// extras yet" rather than an empty dropdown.
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sets ORDER BY created_at DESC, name ASC"
    ).all();
    return json({ sets: (results || []).map((r) => r.name) });
  } catch {
    return json({ sets: [] });
  }
}
