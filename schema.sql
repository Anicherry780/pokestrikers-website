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
