CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'unread' CHECK(state IN ('unread','read','done')),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX inbox_state ON inbox(state,id DESC);
CREATE TABLE inbox_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id INTEGER NOT NULL,
  moderator TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
