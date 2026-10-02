CREATE TABLE identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE CHECK(length(public_id)=8 AND public_id NOT GLOB '*[^0-9]*'),
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE,
  recovery_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','banned')),
  created_at INTEGER NOT NULL,
  nickname_changed_at INTEGER NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE identity_sessions (
  token_hash TEXT PRIMARY KEY,
  identity_id INTEGER NOT NULL REFERENCES identities(id),
  credential_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX identity_session_owner ON identity_sessions(identity_id, expires_at);
CREATE INDEX identity_session_expiry ON identity_sessions(expires_at);
CREATE TABLE identity_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX identity_limit_expiry ON identity_limits(expires_at);
CREATE TABLE identity_claims (
  identity_id INTEGER PRIMARY KEY REFERENCES identities(id),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX identity_claim_ip ON identity_claims(ip_hash, created_at);
CREATE INDEX identity_claim_time ON identity_claims(created_at);
CREATE TABLE identity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id INTEGER NOT NULL REFERENCES identities(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
ALTER TABLE entries ADD COLUMN author_id INTEGER REFERENCES identities(id);
CREATE INDEX entries_author ON entries(author_id, id DESC);
