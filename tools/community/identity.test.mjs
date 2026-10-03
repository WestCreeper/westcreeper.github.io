import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./worker.mjs";
import { identityAdmin, cleanupIdentities } from "./identity.mjs";
import { inboxAdmin } from "./inbox.mjs";
let db, env;
const sql = (query, args = []) => ({
  bind(...values) {
    return sql(query, values);
  },
  async first() {
    return db.prepare(query).get(...args) || null;
  },
  async all() {
    return { results: db.prepare(query).all(...args) };
  },
  async run() {
    const r = db.prepare(query).run(...args);
    return {
      meta: {
        changes: Number(r.changes),
        last_row_id: Number(r.lastInsertRowid),
      },
    };
  },
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://westcreeper.com/community-articles.json")
    return Response.json([
      {
        id: "/2021/02/26/test-article",
        title: "测试文章",
        url: "/2021/02/26/test-article.html",
      },
      {
        id: "/2023/12/29/second",
        title: "第二篇",
        url: "/2023/12/29/second.html",
      },
    ]);
  assert.ok(String(url).includes("/siteverify"));
  return Response.json({
    success: JSON.parse(options.body).response === "valid",
    hostname: "westcreeper.com",
    action: "community",
  });
};
test.beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of [
    "0001_initial.sql",
    "0002_management.sql",
    "0003_identities.sql",
    "0004_inbox.sql",
    "0005_avatars.sql",
    "0006_reactions.sql",
  ])
    db.exec(
      readFileSync(new URL("migrations/" + name, import.meta.url), "utf8"),
    );
  env = {
    DB: {
      prepare: sql,
      async batch(items) {
        db.exec("BEGIN");
        try {
          const out = [];
          for (const s of items) out.push(await s.run());
          db.exec("COMMIT");
          return out;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    IDENTITY_ENABLED: "true",
    IDENTITY_ORIGIN: "https://community.example.test",
    IDENTITY_PEPPER: "test-only-strong-random-key",
    ALLOWED_ORIGINS: "https://westcreeper.com",
    TURNSTILE_HOSTNAMES: "westcreeper.com",
    TURNSTILE_SECRET: "test-secret",
    SUBMISSIONS_ENABLED: "true",
    CONTACT_EMAIL: "contact@westcreeper.com",
    POST_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
  };
});
test.beforeEach(() =>
  db.exec(
    "BEGIN;" +
      readFileSync(
        new URL("migrations/0007_article_comments.sql", import.meta.url),
        "utf8",
      ) +
      "COMMIT;",
  ),
);
test.afterEach(() => db.close());
test.after(() => (globalThis.fetch = realFetch));
async function call(path, data, options = {}) {
  const r = await worker.fetch(
    new Request("https://community.example.test" + path, {
      method: data ? "POST" : "GET",
      headers: {
        Origin: options.origin || "https://westcreeper.com",
        "CF-Connecting-IP": options.ip || "192.0.2.1",
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
    env,
  );
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("Set-Cookie")?.split(";")[0],
    headers: r.headers,
  };
}
const register = (nickname = "像素旅人", ip = "192.0.2.1") =>
  call(
    "/api/identity/register",
    { nickname, token: "valid", saved_ack: true },
    { ip },
  );
const login = (r, ip = "192.0.2.9") =>
  call(
    "/api/identity/login",
    {
      public_id: r.data.identity.public_id,
      recovery_code: r.data.recovery_code,
      token: "valid",
    },
    { ip },
  );
async function manage(r, data) {
  const url = new URL(
    "https://community.example.test/api/admin/identities/" +
      r.data.identity.public_id,
  );
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return identityAdmin(request, env, url, "owner@example.test");
}
test("registration issues a private cookie and a separate recovery code; posting derives the author server-side", async () => {
  const r = await register();
  assert.equal(r.status, 201);
  assert.match(r.data.identity.public_id, /^[1-9]\d{7}$/);
  assert.match(r.data.recovery_code, /^(?:[a-f0-9]{8}-){7}[a-f0-9]{8}$/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
    assert.ok(r.headers.get("Set-Cookie").includes(flag));
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity
      .nickname,
    "像素旅人",
  );
  const raw = db.prepare("SELECT * FROM identities").get();
  assert.notEqual(raw.recovery_hash, r.data.recovery_code.replaceAll("-", ""));
  assert.equal(
    (
      await call(
        "/api/identity/register",
        { nickname: "另一个人", token: "valid", saved_ack: true },
        { cookie: r.cookie },
      )
    ).status,
    409,
  );
  const entry = {
    scope: "board",
    category: "chat",
    title: "测试身份",
    body: "正常留言内容",
    nickname: "伪造站长",
    author_id: 999,
    token: "valid",
  };
  assert.equal((await call("/api/entries", entry)).status, 401);
  assert.equal(
    (await call("/api/entries", entry, { cookie: r.cookie })).status,
    202,
  );
  const saved = db.prepare("SELECT * FROM entries").get();
  assert.equal(saved.nickname, "像素旅人");
  assert.equal(saved.author_id, raw.id);
  assert.equal(saved.status, "pending");
  db.prepare("UPDATE entries SET status='approved'").run();
  const listed = (await call("/api/entries?scope=all")).data.items[0];
  assert.equal(listed.author_code, r.data.identity.public_id);
  assert.ok(!JSON.stringify(listed).includes("recovery"));
  for (const route of ["/api/admin/identities", "/api/admin/inbox"])
    assert.equal((await call(route)).status, 403);
  assert.equal(
    (
      await call(
        "/api/identity/login",
        {
          public_id: r.data.identity.public_id,
          recovery_code: r.data.recovery_code,
          token: "valid",
        },
        { origin: "https://evil.test" },
      )
    ).status,
    403,
  );
});
test("nickname uniqueness normalizes full-width, case and whitespace; rename cooldown is exactly seven days", async () => {
  const r = await register("Ｐｌａｙｅｒ A");
  assert.equal(r.status, 201);
  assert.equal((await register("playera", "192.0.2.2")).status, 409);
  assert.equal((await register("名字\u200b隐藏", "192.0.2.3")).status, 400);
  assert.equal(
    (
      await call(
        "/api/identity/rename",
        { nickname: "新昵称" },
        { cookie: r.cookie },
      )
    ).status,
    409,
  );
  db.prepare("UPDATE identities SET nickname_changed_at=?").run(
    Math.floor(Date.now() / 1000) - 604800,
  );
  assert.equal(
    (
      await call(
        "/api/identity/rename",
        { nickname: "新昵称" },
        { cookie: r.cookie },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/identity/rename",
        { nickname: "再次修改" },
        { cookie: r.cookie },
      )
    ).status,
    409,
  );
  assert.equal((await register("新 昵称", "192.0.2.4")).status, 409);
});
test("claim cooldown, rolling network/global quota and captcha reject excess registrations", async () => {
  assert.equal((await register()).status, 201);
  assert.equal((await register("第二个")).status, 429);
  for (let i = 2; i <= 3; i++) {
    db.prepare("UPDATE identity_claims SET created_at=created_at-601").run();
    assert.equal((await register("领取" + i)).status, 201);
  }
  db.prepare("UPDATE identity_claims SET created_at=created_at-601").run();
  assert.equal((await register("第四个")).status, 429);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM identities").get().n, 3);
  const bad = await call(
    "/api/identity/register",
    { nickname: "无效验证", token: "bad", saved_ack: true },
    { ip: "192.0.2.30" },
  );
  assert.equal(bad.status, 400);
  assert.equal(
    (
      await call(
        "/api/identity/register",
        { nickname: "未确认保存", token: "valid", saved_ack: false },
        { ip: "192.0.2.31" },
      )
    ).status,
    400,
  );
  const t = Math.floor(Date.now() / 1000);
  for (let i = 3; i < 100; i++) {
    const a = db
      .prepare(
        "INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES (?,?,?,?,?,?)",
      )
      .run(String(20000000 + i), "模拟" + i, "mock" + i, "hash", t, t);
    db.prepare("INSERT INTO identity_claims VALUES (?,?,?)").run(
      a.lastInsertRowid,
      "mock",
      t,
    );
  }
  assert.equal((await register("全站超额", "192.0.2.99")).status, 429);
});
test("recovery restores the same identity; rotation revokes old code and other devices but survives response loss", async () => {
  const r = await register(),
    second = await login(r);
  assert.equal(second.status, 200);
  assert.equal(second.data.identity.public_id, r.data.identity.public_id);
  const rotated = await call(
    "/api/identity/rotate",
    { confirm: true },
    { cookie: r.cookie },
  );
  assert.equal(rotated.status, 200);
  assert.equal(
    (await call("/api/identity/me", null, { cookie: second.cookie })).data
      .identity,
    null,
  );
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity
      .public_id,
    r.data.identity.public_id,
  );
  assert.equal((await login(r)).status, 401);
  assert.equal((await login(rotated)).status, 200);
  assert.equal(
    (await call("/api/identity/logout", {}, { cookie: r.cookie })).status,
    200,
  );
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity,
    null,
  );
});
test("identity administration excludes secrets, bans invalidate sessions and login, cleanup removes expired credentials", async () => {
  const r = await register();
  const url = new URL(
    "https://community.example.test/api/admin/identities?q=" +
      encodeURIComponent("像素"),
  );
  const list = await (
    await identityAdmin(new Request(url), env, url, "owner@example.test")
  ).json();
  assert.equal(list.items.length, 1);
  assert.ok(!JSON.stringify(list).includes("hash"));
  await manage(r, {
    action: "ban",
    expected_revision: 1,
    reason: "测试违规处理依据",
  });
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity,
    null,
  );
  assert.equal((await login(r)).status, 401);
  assert.equal(
    db.prepare("SELECT action FROM identity_log").get().action,
    "ban",
  );
  await assert.rejects(
    () =>
      manage(r, {
        action: "unban",
        expected_revision: 1,
        reason: "旧版本不能覆盖",
      }),
    /更新/,
  );
  await cleanupIdentities(env);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM identity_sessions").get().n,
    0,
  );
});
test("login brute-force attempts are limited even across requests with invalid codes", async () => {
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call("/api/identity/login", {
          public_id: "12345678",
          recovery_code: "a".repeat(64),
          token: "valid",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call("/api/identity/login", {
        public_id: "12345678",
        recovery_code: "a".repeat(64),
        token: "valid",
      })
    ).status,
    429,
  );
});
test("inbox accepts only the contact address, parses MIME as inert text, deduplicates, and keeps mail private", async () => {
  const raw =
    "From: Visitor <visitor@example.test>\r\nTo: contact@westcreeper.com\r\nSubject: =?UTF-8?B?6aW85bmy5om+5Zue?=\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n<script>evil()</script>\n饼干编号 12345678";
  const message = (to = "contact@westcreeper.com") => ({
    from: "visitor@example.test",
    to,
    rawSize: new TextEncoder().encode(raw).length,
    raw: new Blob([raw]).stream(),
    setReject(reason) {
      this.rejected = reason;
    },
  });
  const wrong = message("other@westcreeper.com");
  await worker.email(wrong, env);
  assert.ok(wrong.rejected);
  const valid = message();
  await worker.email(valid, env);
  await worker.email(message(), env);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inbox").get().n, 1);
  const url = new URL("https://community.example.test/api/admin/inbox");
  const data = await (
    await inboxAdmin(new Request(url), env, url, "owner@example.test")
  ).json();
  assert.equal(data.items[0].subject, "饼干找回");
  assert.match(data.items[0].body, /<script>/);
  assert.equal((await call("/api/inbox")).status, 404);
  assert.equal((await call("/api/admin/inbox")).status, 403);
  const itemUrl = new URL(url + "/1");
  await inboxAdmin(
    new Request(itemUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "done",
        note: "已核验线索",
        expected_revision: 1,
      }),
    }),
    env,
    itemUrl,
    "owner@example.test",
  );
  assert.equal(db.prepare("SELECT state FROM inbox").get().state, "done");
  const large = message();
  large.rawSize = 600000;
  await worker.email(large, env);
  assert.ok(large.rejected);
});

test("all new posts require a cookie; disabling identity never restores nickname-only posts", async () => {
  const draft = {
    scope: "board",
    category: "chat",
    title: "饼干测试",
    body: "新的身份留言",
    nickname: "伪造昵称",
    token: "valid",
  };
  assert.equal((await call("/api/entries", draft)).status, 401);
  const r = await register();
  assert.equal(
    (await call("/api/entries", draft, { cookie: r.cookie })).status,
    202,
  );
  env.IDENTITY_ENABLED = "false";
  assert.equal((await call("/api/entries", draft)).status, 503);
  assert.equal(
    (await call("/api/entries", draft, { cookie: r.cookie })).status,
    503,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entries").get().n, 1);
  env.IDENTITY_ENABLED = "true";
  env.IDENTITY_ORIGIN = "https://different.example.test";
  assert.equal(
    (await call("/api/entries", draft, { cookie: r.cookie })).status,
    403,
  );
  db.prepare(
    "INSERT INTO entries(scope,category,title,nickname,body,status) VALUES ('board','chat','旧留言','历史访客','历史内容保留','approved')",
  ).run();
  const feed = await call("/api/entries?scope=all");
  assert.equal(feed.status, 200);
  assert.equal(feed.data.items[0].author_code, null);
  assert.equal(feed.data.items[0].nickname, "历史访客");
});

test("avatars are authenticated, allowlisted, revision-safe and independent of nickname cooldown", async () => {
  const r = await register();
  assert.equal(r.data.identity.avatar, "moss");
  assert.equal(r.data.identity.is_owner, false);
  assert.equal(
    (
      await call("/api/identity/avatar", {
        avatar: "fox",
        expected_revision: 1,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/identity/avatar",
        { avatar: "https://evil.test/tracker.svg", expected_revision: 1 },
        { cookie: r.cookie },
      )
    ).status,
    400,
  );
  const changed = await call(
    "/api/identity/avatar",
    { avatar: "fox", expected_revision: 1 },
    { cookie: r.cookie },
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.data.identity.avatar, "fox");
  assert.equal(
    changed.data.identity.rename_after,
    r.data.identity.rename_after,
  );
  assert.equal(
    (
      await call(
        "/api/identity/avatar",
        { avatar: "robot", expected_revision: 1 },
        { cookie: r.cookie },
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity
      .avatar,
    "fox",
  );
  await call(
    "/api/entries",
    {
      scope: "board",
      category: "chat",
      title: "头像测试",
      body: "查看我的头像",
      token: "valid",
      author_code: "00000000",
      author_avatar: "robot",
    },
    { cookie: r.cookie },
  );
  db.exec("UPDATE entries SET status='approved'");
  const entry = (await call("/api/entries?scope=all")).data.items[0];
  assert.equal(entry.author_avatar, "fox");
  assert.notEqual(entry.author_code, "00000000");
});
test("owner name is reserved and special eight-zero ID uses normal recovery authentication", async () => {
  assert.equal((await register("西部苦力怕")).status, 409);
  const r = await register("普通访客", "192.0.2.2");
  db.exec("UPDATE identities SET nickname_changed_at=0");
  assert.equal(
    (
      await call(
        "/api/identity/rename",
        { nickname: "西部苦力怕" },
        { cookie: r.cookie },
      )
    ).status,
    409,
  );
  const { digest } = await import("./identity.mjs");
  const code = "b".repeat(64);
  db.prepare(
    "INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES ('00000000','西部苦力怕','西部苦力怕',?,0,0)",
  ).run(await digest("recovery", code));
  const signed = await call("/api/identity/login", {
    public_id: "00000000",
    recovery_code: code,
    token: "valid",
  });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.identity.is_owner, true);
  assert.equal(signed.data.identity.public_id, "00000000");
});

test("reactions require login and approved content, are idempotent, replaceable and removable", async () => {
  const a = await register(),
    b = await register("另位访客", "192.0.2.3");
  await call(
    "/api/entries",
    {
      scope: "board",
      category: "chat",
      title: "回应测试",
      body: "这是测试正文",
      token: "valid",
    },
    { cookie: a.cookie },
  );
  const id = db.prepare("SELECT id FROM entries").get().id,
    path = `/api/entries/${id}/reactions`;
  assert.equal((await call(path, { reaction: "like" })).status, 401);
  assert.equal(
    (await call(path, { reaction: "like" }, { cookie: a.cookie })).status,
    404,
  );
  db.exec("UPDATE entries SET status='approved'");
  assert.equal(
    (await call(path, { reaction: "<script>" }, { cookie: a.cookie })).status,
    400,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await call(path, { reaction: "like" }, { cookie: a.cookie })).status,
      200,
    );
  await call(path, { reaction: "like" }, { cookie: b.cookie });
  let feed = (await call("/api/entries?scope=all", null, { cookie: a.cookie }))
    .data.items[0];
  assert.deepEqual(feed.reactions, [{ key: "like", count: 2, mine: true }]);
  assert.equal(feed.reactions_owner, a.data.identity.public_id);
  const members = (await call(path + "?reaction=like")).data;
  assert.equal(members.items.length, 2);
  assert.equal(members.next, null);
  assert.deepEqual(Object.keys(members.items[0]).sort(), [
    "nickname",
    "public_id",
    "reaction",
  ]);
  assert.ok(
    members.items.some((p) => p.public_id === a.data.identity.public_id),
  );
  assert.deepEqual((await call(path + "?reaction=fire")).data.items, []);
  assert.equal((await call(path + "?reaction=bad")).status, 400);
  assert.equal((await call(path + "?after=-1")).status, 400);
  await call(path, { reaction: "love" }, { cookie: a.cookie });
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM entry_reactions").get().n,
    2,
  );
  let r = await call(path, { reaction: null }, { cookie: a.cookie });
  assert.deepEqual(r.data.reactions, [{ key: "like", count: 1, mine: false }]);
  assert.equal(
    (await call(path, { reaction: null }, { cookie: a.cookie })).status,
    200,
  );
  assert.equal(
    (
      await call(
        path,
        { reaction: "fire" },
        { cookie: b.cookie, origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  db.exec("UPDATE entries SET status='hidden'");
  assert.equal((await call(path)).status, 404);
  assert.equal(
    (await call(path, { reaction: "like" }, { cookie: a.cookie })).status,
    404,
  );
  assert.equal((await call("/api/entries?scope=all")).data.items.length, 0);
});
test("reply reactions obey parent visibility and banned identities cannot react", async () => {
  const a = await register();
  db.exec(
    "INSERT INTO entries(scope,category,nickname,body,status) VALUES ('board','chat','旧访客','主帖','approved'); INSERT INTO entries(scope,parent_id,category,nickname,body,status) VALUES ('board',1,'chat','旧访客','回复','approved')",
  );
  assert.equal(
    (
      await call(
        "/api/entries/2/reactions",
        { reaction: "clap" },
        { cookie: a.cookie },
      )
    ).status,
    200,
  );
  db.exec("UPDATE entries SET status='hidden' WHERE id=1");
  assert.equal((await call("/api/entries/2/reactions")).status, 404);
  assert.equal(
    (
      await call(
        "/api/entries/2/reactions",
        { reaction: null },
        { cookie: a.cookie },
      )
    ).status,
    404,
  );
  db.exec(
    "UPDATE entries SET status='approved' WHERE id=1; UPDATE identities SET state='banned'",
  );
  assert.equal(
    (
      await call(
        "/api/entries/2/reactions",
        { reaction: "clap" },
        { cookie: a.cookie },
      )
    ).status,
    403,
  );
  const feed = (await call("/api/entries?scope=board&parent=1")).data;
  assert.deepEqual(feed.items[0].reactions, []);
  assert.deepEqual((await call("/api/entries/2/reactions")).data.items, []);
  db.exec("UPDATE identities SET state='active'");
  for (let i = 0; i < 30; i++)
    await call(
      "/api/entries/2/reactions",
      { reaction: "clap" },
      { cookie: a.cookie },
    );
  assert.equal(
    (
      await call(
        "/api/entries/2/reactions",
        { reaction: "clap" },
        { cookie: a.cookie },
      )
    ).status,
    429,
  );
});
test("reaction audience pagination includes zero ID, excludes banned and deleted content, and exposes only public fields", async () => {
  db.exec(
    "INSERT INTO entries(scope,category,nickname,body,status) VALUES ('board','chat','访客','正文','approved')",
  );
  const insert = db.prepare(
    "INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES (?,?,?,'private-hash',1,1)",
  );
  for (let i = 0; i < 23; i++) {
    const r = insert.run(String(i).padStart(8, "0"), `用户${i}`, `user${i}`);
    db.prepare(
      "INSERT INTO entry_reactions(entry_id,identity_id,reaction,updated_at) VALUES (1,?,'like',1)",
    ).run(r.lastInsertRowid);
  }
  db.exec("UPDATE identities SET state='banned' WHERE public_id='00000022'");
  const first = (await call("/api/entries/1/reactions?reaction=like")).data;
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0].public_id, "00000000");
  const second = (
    await call("/api/entries/1/reactions?reaction=like&after=" + first.next)
  ).data;
  assert.equal(second.items.length, 2);
  assert.equal(second.next, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((p) => p.public_id)).size,
    22,
  );
  assert.ok(!JSON.stringify(first).includes("private-hash"));
  db.exec("UPDATE entries SET deleted_at='2026-10-03'");
  assert.equal((await call("/api/entries/1/reactions")).status, 404);
});
test("admin recovery reset requires verification and revision; invalidates codes/sessions without logging secrets", async () => {
  const r = await register();
  const data = {
    action: "reset-recovery",
    expected_revision: 1,
    reason: "已通过线下核对和此前的私密联系记录确认身份归属",
    verified: true,
    confirm_public_id: r.data.identity.public_id,
  };
  assert.equal(
    (await call("/api/admin/identities/" + r.data.identity.public_id, data))
      .status,
    403,
  );
  await assert.rejects(() => manage(r, { ...data, verified: false }));
  await assert.rejects(() =>
    manage(r, { ...data, confirm_public_id: "87654321" }),
  );
  const response = await manage(r, data),
    value = await response.json();
  assert.match(value.recovery_code, /^(?:[a-f0-9]{8}-){7}[a-f0-9]{8}$/);
  assert.equal((await login(r)).status, 401);
  assert.equal(
    (await call("/api/identity/me", null, { cookie: r.cookie })).data.identity,
    null,
  );
  assert.equal(
    (
      await call("/api/identity/login", {
        public_id: r.data.identity.public_id,
        recovery_code: value.recovery_code,
        token: "valid",
      })
    ).status,
    200,
  );
  const log = db
    .prepare("SELECT * FROM identity_log WHERE action='admin-reset-recovery'")
    .get();
  assert.equal(log.detail, data.reason);
  assert.ok(!JSON.stringify(log).includes(value.recovery_code));
  await assert.rejects(() => manage(r, data));
  const current = db
    .prepare("SELECT revision,nickname,avatar FROM identities")
    .get();
  assert.equal(current.revision, 2);
  assert.equal(current.nickname, r.data.identity.nickname);
});

test("personal activity is session-bound, paginated and never exposes another visitor's pending content", async () => {
  const a = await register(), b = await register('其他访客','192.0.2.30');
  const owner = db.prepare('SELECT id FROM identities WHERE public_id=?').get(a.data.identity.public_id).id;
  const other = db.prepare('SELECT id FROM identities WHERE public_id=?').get(b.data.identity.public_id).id;
  const insert = db.prepare("INSERT INTO entries(scope,category,author_id,nickname,body,status,parent_id) VALUES ('board','chat',?,'访客',?,?,?)");
  for(let i=0;i<22;i++) insert.run(owner,'我的待审核'+i,'pending',null);
  const secret = Number(insert.run(other,'别人不可公开的草稿','pending',null).lastInsertRowid);
  const publicTopic = Number(insert.run(other,'公开讨论','approved',null).lastInsertRowid);
  const ownReply = Number(insert.run(owner,'我的公开回复','approved',publicTopic).lastInsertRowid);
  const pendingOnly = Number(insert.run(other,'另一条公开讨论','approved',null).lastInsertRowid);
  insert.run(owner,'我的待审回复','pending',pendingOnly);
  insert.run(other,'别人的待审回复','pending',publicTopic);
  const url='/api/identity/entries';
  assert.equal((await call(url)).status,401);
  const first = await call(url+'?view=mine&public_id='+b.data.identity.public_id,null,{cookie:a.cookie});
  assert.equal(first.status,200);
  assert.equal(first.data.items.length,20);
  assert.ok(first.data.items.every(e=>e.body.startsWith('我的')));
  assert.ok(!JSON.stringify(first.data).includes('recovery_hash'));
  const second=await call(url+'?before='+first.data.next,null,{cookie:a.cookie});
  assert.equal(second.data.items.length,4);
  assert.equal(new Set([...first.data.items,...second.data.items].map(e=>e.id)).size,24);
  assert.equal(second.data.next,null);
  const participated=(await call(url+'?view=participated',null,{cookie:a.cookie})).data;
  assert.deepEqual(participated.items.map(e=>e.id),[publicTopic]);
  assert.ok(!JSON.stringify(participated).includes('待审'));
  assert.equal((await call(url+'?status=approved',null,{cookie:a.cookie})).data.items[0].id,ownReply);
  assert.equal((await call('/api/entries?scope=all&entry='+secret)).data.items.length,0);
  assert.equal((await call('/api/entries?scope=all&entry='+publicTopic)).data.items[0].id,publicTopic);
  db.prepare("UPDATE entries SET status='hidden' WHERE id=?").run(publicTopic);
  assert.equal((await call(url+'?view=participated',null,{cookie:a.cookie})).data.items.length,0);
  const hiddenReply=(await call(url+'?status=approved',null,{cookie:a.cookie})).data.items[0];
  assert.equal(hiddenReply.is_public,0);
  assert.equal(hiddenReply.body,'我的公开回复');
  db.prepare("UPDATE entries SET deleted_at='2026-10-03' WHERE id=?").run(publicTopic);
  assert.equal((await call(url+'?status=approved',null,{cookie:a.cookie})).data.items.length,0);
  assert.equal((await call(url+'?view=bad',null,{cookie:a.cookie})).status,400);
  db.prepare("UPDATE identities SET state='banned' WHERE id=?").run(owner);
  assert.equal((await call(url,null,{cookie:a.cookie})).status,403);
});
