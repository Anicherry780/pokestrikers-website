-- PokeStrikers D1 schema. Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  is_admin              INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  daily_codes_used      INTEGER NOT NULL DEFAULT 0,
  last_reset_date       TEXT,
  bonus_unlocked_today  INTEGER NOT NULL DEFAULT 0,
  bonus_timer_start     TEXT
);

CREATE TABLE IF NOT EXISTS codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL,
  pack_name    TEXT,
  uploaded_by  INTEGER,
  uploaded_at  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'available',  -- available | claimed | expired
  claimed_by   INTEGER,
  claimed_at   TEXT,
  expires_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_codes_status ON codes(status);
CREATE INDEX IF NOT EXISTS idx_codes_claimed_by ON codes(claimed_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_codes_code ON codes(code);

-- Every code that has ever been claimed or expired. Uploads are checked against
-- this so a burned code can never re-enter the vault.
CREATE TABLE IF NOT EXISTS used_codes (
  code    TEXT PRIMARY KEY,
  used_at TEXT DEFAULT (datetime('now'))
);

-- Set subscriptions. Keyed by username (not id) to match the notifications table.
CREATE TABLE IF NOT EXISTS subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  pack_name  TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(username, pack_name)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  message    TEXT NOT NULL,
  pack_name  TEXT NOT NULL,
  is_read    INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subs_pack ON subscriptions(pack_name);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(username, is_read);

-- Small key/value store for admin-set options. Currently holds
-- 'bonus_video_id': the YouTube id pinned as the watch-to-unlock video.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

-- Public chat. Readable by anyone; only logged-in users can post.
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(username);

-- Sets the admin adds after launch. Merged with the built-in list in
-- public/js/packs.js by GET /api/sets, so this only holds the additions.
CREATE TABLE IF NOT EXISTS sets (
  name       TEXT PRIMARY KEY,
  series     TEXT,
  created_at TEXT NOT NULL
);
