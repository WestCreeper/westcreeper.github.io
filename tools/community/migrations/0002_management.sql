ALTER TABLE entries ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE entries ADD COLUMN deleted_at TEXT;
CREATE INDEX entries_feed ON entries(status, parent_id, id DESC) WHERE deleted_at IS NULL;
CREATE TABLE content_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  moderator TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('edit','delete')),
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
