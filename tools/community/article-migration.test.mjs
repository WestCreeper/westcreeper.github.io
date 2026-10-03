import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
test("article migration preserves replies, reactions, audits, IDs and sequence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const migrations = new URL("./migrations/", import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((f) => f < "0007")
      .sort())
      db.exec(readFileSync(new URL(file, migrations), "utf8"));
    db.exec(`
      INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES ('00000000','站长','owner','private',1,1);
      INSERT INTO entries(id,scope,category,nickname,body,status,author_id,revision) VALUES (2,'board','chat','站长','旧主帖','approved',1,4);
      INSERT INTO entries(id,scope,category,parent_id,nickname,body,status,author_id) VALUES (3,'board','chat',2,'站长','旧回复','approved',1);
      INSERT INTO entries(id,scope,category,nickname,body) VALUES (100,'board','chat','站长','移除');
      DELETE FROM entries WHERE id=100;
      INSERT INTO entry_reactions VALUES (3,1,'like',1);
      INSERT INTO moderation_log(entry_id,moderator,old_status,new_status,old_progress,new_progress) VALUES (2,'admin','pending','approved','open','open');
      INSERT INTO content_log(entry_id,moderator,action,before_json,after_json) VALUES (2,'admin','edit','{}','{}');
    `);
    const tables = [
      "entries",
      "entry_reactions",
      "moderation_log",
      "content_log",
    ];
    const before = tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all());
    db.exec(
      "BEGIN;" +
        readFileSync(new URL("0007_article_comments.sql", migrations), "utf8") +
        "COMMIT;",
    );
    assert.deepEqual(
      tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all()),
      before,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const created = db
      .prepare(
        "INSERT INTO entries(scope,category,nickname,body) VALUES ('article:test','article','站长','新文章评论')",
      )
      .run();
    assert.equal(Number(created.lastInsertRowid), 101);
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO entries(scope,category,parent_id,nickname,body) VALUES ('board','chat',999,'站长','孤立回复')",
        )
        .run(),
    );
    assert.throws(() => db.prepare("DELETE FROM entries WHERE id=2").run());
  } finally {
    db.close();
  }
});
