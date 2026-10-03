CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id INTEGER NOT NULL REFERENCES identities(id),
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  kind TEXT NOT NULL CHECK(kind IN ('review','reply')),
  outcome TEXT NOT NULL CHECK(outcome IN ('pending','approved','rejected','hidden')),
  event_key INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at TEXT,
  UNIQUE(recipient_id,entry_id,kind,event_key)
);
CREATE INDEX notifications_recipient ON notifications(recipient_id,id DESC);
CREATE INDEX notifications_unread ON notifications(recipient_id,id DESC) WHERE read_at IS NULL;

-- Runs inside the existing atomic moderation/audit batch. No historical backfill.
CREATE TRIGGER moderation_notifications AFTER INSERT ON moderation_log
WHEN NEW.old_status != NEW.new_status
BEGIN
  INSERT OR IGNORE INTO notifications(recipient_id,entry_id,kind,outcome,event_key)
    SELECT e.author_id,e.id,'review',NEW.new_status,NEW.id
    FROM entries e JOIN identities i ON i.id=e.author_id
    WHERE e.id=NEW.entry_id AND i.state='active';
  -- A reply only alerts its topic author once, even if hidden then approved again.
  INSERT OR IGNORE INTO notifications(recipient_id,entry_id,kind,outcome,event_key)
    SELECT p.author_id,e.id,'reply','approved',0
    FROM entries e JOIN entries p ON p.id=e.parent_id JOIN identities i ON i.id=p.author_id
    WHERE e.id=NEW.entry_id AND NEW.new_status='approved'
      AND p.status='approved' AND p.deleted_at IS NULL
      AND e.deleted_at IS NULL AND e.author_id != p.author_id AND i.state='active';
END;
