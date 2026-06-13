import { getUser } from "../_utils.js";

// Returns the user if they are an admin, otherwise null.
export async function requireAdmin(request, env) {
  const user = await getUser(request, env);
  if (!user || !user.is_admin) return null;
  return user;
}
