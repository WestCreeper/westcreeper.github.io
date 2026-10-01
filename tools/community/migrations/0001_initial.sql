CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  parent_id INTEGER REFERENCES entries(id),
  category TEXT NOT NULL CHECK(category IN ('game','feedback','find','chat')),
  title TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','hidden')),
  progress TEXT NOT NULL DEFAULT 'open' CHECK(progress IN ('open','working','done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX entries_public ON entries(scope, parent_id, status, id DESC);
CREATE INDEX entries_board ON entries(scope, parent_id, status, category, id DESC);
CREATE INDEX entries_queue ON entries(status, id DESC);
CREATE INDEX entries_parent ON entries(parent_id, status, id);
CREATE TABLE moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  moderator TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  old_progress TEXT NOT NULL,
  new_progress TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
