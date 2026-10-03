-- D1 migrations run in one transaction. Keep every ID and all dependent rows.
-- Existing foreign keys have no cascading delete actions.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE entries_article_upgrade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  parent_id INTEGER REFERENCES entries(id),
  category TEXT NOT NULL CHECK(category IN ('game','article','feedback','find','chat')),
  title TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','hidden')),
  progress TEXT NOT NULL DEFAULT 'open' CHECK(progress IN ('open','working','done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  author_id INTEGER REFERENCES identities(id)
);
INSERT INTO entries_article_upgrade SELECT * FROM entries;
-- Preserve the autoincrement high-water mark, including removed historical IDs.
UPDATE sqlite_sequence SET seq=MAX(seq,(SELECT seq FROM sqlite_sequence WHERE name='entries')) WHERE name='entries_article_upgrade';
DROP TABLE entries;
ALTER TABLE entries_article_upgrade RENAME TO entries;
CREATE INDEX entries_public ON entries(scope, parent_id, status, id DESC);
CREATE INDEX entries_board ON entries(scope, parent_id, status, category, id DESC);
CREATE INDEX entries_queue ON entries(status, id DESC);
CREATE INDEX entries_parent ON entries(parent_id, status, id);
CREATE INDEX entries_feed ON entries(status, parent_id, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX entries_author ON entries(author_id, id DESC);
PRAGMA defer_foreign_keys = OFF;
