// Shared helpers for PokeStrikers Pages Functions.
// Files starting with "_" are NOT routed — they can only be imported.

export const DAILY_FREE = 1;            // free codes per claim window
export const CLAIM_WINDOW_MS = 5 * 60 * 1000;  // 5 min to copy a claimed code
export const DAY_MS = 24 * 60 * 60 * 1000;     // 24h cooldown after first claim
export const ADMIN_USERNAME = "pokestrikers";

export const CODE_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

/* ---------- responses ---------- */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
export const err = (message, status = 400) => json({ error: message }, status);

/* ---------- dates ---------- */
export const nowIso = () => new Date().toISOString();
export const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

/* ---------- encoding helpers ---------- */
const enc = new TextEncoder();
function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBuf(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToB64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const strToB64url = (s) => bytesToB64url(enc.encode(s));
const b64urlToStr = (s) => new TextDecoder().decode(b64urlToBytes(s));

/* ---------- password hashing (PBKDF2 via Web Crypto; bcrypt isn't available in Workers) ---------- */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, km, 256
  );
  return `pbkdf2$${iterations}$${bufToHex(salt)}$${bufToHex(bits)}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "pbkdf2") return false;
    const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: parseInt(iterStr, 10), hash: "SHA-256" },
      km, 256
    );
    const computed = bufToHex(bits);
    // constant-time-ish compare
    if (computed.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

/* ---------- session tokens (HMAC-signed, stored in localStorage on the client) ---------- */
function secret(env) {
  return env.SESSION_SECRET || "INSECURE-DEV-SECRET-set-SESSION_SECRET-in-cloudflare";
}
async function hmacKey(env) {
  return crypto.subtle.importKey("raw", enc.encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
// Generic signed payloads. Used for session tokens and for the watch tickets
// that gate the bonus code.
export async function signPayload(env, obj) {
  const payload = strToB64url(JSON.stringify(obj));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload));
  return `${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}
export async function verifyPayload(env, token) {
  try {
    if (!token) return null;
    const [payload, sig] = String(token).split(".");
    if (!payload || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), b64urlToBytes(sig), enc.encode(payload));
    if (!ok) return null;
    return JSON.parse(b64urlToStr(payload));
  } catch {
    return null;
  }
}

export async function signToken(env, uid) {
  return signPayload(env, { uid, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
}
export async function verifyToken(env, token) {
  const data = await verifyPayload(env, token);
  if (!data || !data.exp || data.exp < Date.now()) return null;
  return data; // { uid, exp }
}

/* ---------- login throttling ---------- */
// Failed attempts are counted in the settings k/v table. Only attempts against
// usernames that actually exist are recorded, so a spray of random names cannot
// grow the table — and guessing a name that doesn't exist can't succeed anyway.
export const LOGIN_MAX_FAILS = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const failKey = (username) => `login_fail:${String(username).toLowerCase()}`;

// Returns ms remaining if locked out, otherwise 0.
export async function loginLockout(env, username) {
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
      .bind(failKey(username)).first();
    if (!row || !row.value) return 0;

    const { n, first } = JSON.parse(row.value);
    const age = Date.now() - first;
    if (age >= LOGIN_WINDOW_MS) return 0;           // window elapsed
    return n >= LOGIN_MAX_FAILS ? LOGIN_WINDOW_MS - age : 0;
  } catch {
    return 0;   // never lock people out because the store is unavailable
  }
}

export async function recordLoginFailure(env, username) {
  try {
    const key = failKey(username);
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();

    let n = 1, first = Date.now();
    if (row && row.value) {
      const prev = JSON.parse(row.value);
      if (Date.now() - prev.first < LOGIN_WINDOW_MS) { n = prev.n + 1; first = prev.first; }
    }

    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, JSON.stringify({ n, first }), nowIso()).run();
  } catch { /* throttling is best-effort */ }
}

export async function clearLoginFailures(env, username) {
  try {
    await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(failKey(username)).run();
  } catch { /* best-effort */ }
}

/* ---------- auth + daily reset ---------- */
export function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

// Resolve the current user from the request, applying the midnight daily reset.
export async function getUser(request, env) {
  const data = await verifyToken(env, bearer(request));
  if (!data) return null;
  let user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(data.uid).first();
  if (!user) return null;

  return applyWindowReset(user, env);
}

// 24h rolling window. `last_reset_date` holds the ISO timestamp the current claim
// window started (set on the first claim). Once 24h have passed, the quota and
// bonus reset and the window clears so the next claim starts a fresh 24h.
export async function applyWindowReset(user, env) {
  if (user.last_reset_date) {
    const started = new Date(user.last_reset_date).getTime();
    if (!isNaN(started) && Date.now() - started >= DAY_MS) {
      await env.DB.prepare(
        "UPDATE users SET daily_codes_used = 0, bonus_unlocked_today = 0, bonus_timer_start = NULL, last_reset_date = NULL WHERE id = ?"
      ).bind(user.id).run();
      user.daily_codes_used = 0;
      user.bonus_unlocked_today = 0;
      user.bonus_timer_start = null;
      user.last_reset_date = null;
    }
  }
  return user;
}

// ISO time the current cooldown ends (window start + 24h), or null if no window.
export function resetAt(u) {
  if (!u.last_reset_date) return null;
  const started = new Date(u.last_reset_date).getTime();
  if (isNaN(started)) return null;
  return new Date(started + DAY_MS).toISOString();
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    is_admin: !!u.is_admin,
    daily_codes_used: u.daily_codes_used,
    bonus_unlocked_today: !!u.bonus_unlocked_today,
    reset_at: resetAt(u),
  };
}

// Max codes a user may claim in the current window given bonus state.
export const dailyAllowance = (u) => DAILY_FREE + (u.bonus_unlocked_today ? 1 : 0);

// Lazily flip claimed-but-expired codes to "expired", recording them in
// used_codes on the way so they can never be uploaded again.
export async function sweepExpired(env) {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO used_codes (code, used_at)
       SELECT code, ? FROM codes
        WHERE status = 'claimed' AND expires_at IS NOT NULL AND expires_at < ?`
  ).bind(now, now).run();
  await env.DB.prepare(
    "UPDATE codes SET status = 'expired' WHERE status = 'claimed' AND expires_at IS NOT NULL AND expires_at < ?"
  ).bind(now).run();
}

/* ---------- used codes ---------- */
// A code lands here the moment it is claimed (and again when it expires), so a
// burned code can never be re-uploaded even after cleanup deletes the row.
export async function markUsed(env, code) {
  await env.DB.prepare("INSERT OR IGNORE INTO used_codes (code, used_at) VALUES (?, ?)")
    .bind(code, nowIso()).run();
}
export async function isUsed(env, code) {
  const row = await env.DB.prepare("SELECT code FROM used_codes WHERE code = ?").bind(code).first();
  return !!row;
}

/* ---------- notifications ---------- */
// Fan a "new code" notification out to everyone subscribed to this set.
// The uploader never notifies themselves. Returns how many were created.
export async function notifySubscribers(env, packName, uploaderUsername) {
  const { results } = await env.DB.prepare(
    "SELECT username FROM subscriptions WHERE pack_name = ?"
  ).bind(packName).all();

  const targets = (results || [])
    .map((r) => r.username)
    .filter((u) => u && u !== uploaderUsername);
  if (!targets.length) return 0;

  const message = `New ${packName} code available!`;
  const now = nowIso();
  const stmt = env.DB.prepare(
    "INSERT INTO notifications (username, message, pack_name, is_read, created_at) VALUES (?, ?, ?, 0, ?)"
  );
  // One batch instead of one round-trip per subscriber (Workers cap subrequests).
  await env.DB.batch(targets.map((u) => stmt.bind(u, message, packName, now)));
  return targets.length;
}
