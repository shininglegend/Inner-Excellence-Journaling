-- Users. No passwords: login is by emailed one-time link.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,            -- always stored lowercase
  name TEXT,
  admin INTEGER NOT NULL DEFAULT 0,
  joined TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Emails an admin has added who haven't signed in yet. Only invited emails can get a login link.
CREATE TABLE invites (
  email TEXT PRIMARY KEY,
  admin INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-time login links. Only the SHA-256 of the token is stored.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  created_at INTEGER NOT NULL,           -- unix seconds
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_email ON login_tokens(email, created_at);
CREATE INDEX login_tokens_ip ON login_tokens(ip, created_at);

-- Sessions. Only the SHA-256 of the cookie value is stored.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- content and response are AES-GCM ciphertext ("v1:..."), see src/crypto.ts.
CREATE TABLE journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  resp_id INTEGER REFERENCES users(id),
  content TEXT,
  response TEXT,
  time_crte TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  time_updt TEXT,
  time_resp TEXT,
  submitted INTEGER NOT NULL DEFAULT 0,
  resp_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX journals_user ON journals(user_id, submitted, time_crte);
