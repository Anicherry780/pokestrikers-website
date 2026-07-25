import { json } from "./_utils.js";

// GET /api/sets — admin-added sets with the series each belongs to. The client
// merges these into the built-in list in public/js/packs.js. A missing table or
// column just means "no extras yet" rather than an empty dropdown.
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT name, series FROM sets ORDER BY created_at DESC, name ASC"
    ).all();
    return json({
      sets: (results || []).map((r) => ({ name: r.name, series: r.series || null })),
    });
  } catch {
    return json({ sets: [] });
  }
}
