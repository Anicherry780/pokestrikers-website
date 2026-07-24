import { getUser } from "../_utils.js";

// Admin rights come from the is_admin column, never from the username string.
// Matching on the name was unsafe: SQLite compares usernames case-sensitively,
// so "PokeStrikers" registered as a separate account yet still passed a
// lowercased name check. The column is the single source of truth.
export async function requireAdmin(request, env) {
  const user = await getUser(request, env);
  if (!user || !user.is_admin) return null;
  return user;
}
