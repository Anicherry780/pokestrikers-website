import { getUser, ADMIN_USERNAME } from "../_utils.js";

// Returns the user only if they are the dedicated admin account, otherwise null.
export async function requireAdmin(request, env) {
  const user = await getUser(request, env);
  if (!user || (user.username || "").toLowerCase() !== ADMIN_USERNAME) return null;
  return user;
}
