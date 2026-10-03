import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./worker.mjs";
import { digest } from "./identity.mjs";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON");
sqlite.exec(
  readFileSync(new URL("migrations/0001_initial.sql", import.meta.url), "utf8"),
);
sqlite.exec(
  readFileSync(
    new URL("migrations/0002_management.sql", import.meta.url),
    "utf8",
  ),
);
for (const name of [
  "0003_identities.sql",
  "0004_inbox.sql",
  "0005_avatars.sql",
  "0006_reactions.sql",
])
  sqlite.exec(
    readFileSync(new URL("migrations/" + name, import.meta.url), "utf8"),
  );
sqlite.exec(
  "BEGIN;" +
    readFileSync(
      new URL("migrations/0007_article_comments.sql", import.meta.url),
      "utf8",
    ) +
    "COMMIT;",
);
sqlite.exec(
  readFileSync(
    new URL("migrations/0008_notifications.sql", import.meta.url),
    "utf8",
  ),
);
const statement = (sql, args = []) => ({
  bind(...params) {
    return statement(sql, params);
  },
  async first() {
    return sqlite.prepare(sql).get(...args) || null;
  },
  async all() {
    return { results: sqlite.prepare(sql).all(...args) };
  },
  async run() {
    const value = sqlite.prepare(sql).run(...args);
    return {
      meta: {
        changes: Number(value.changes),
        last_row_id: Number(value.lastInsertRowid),
      },
    };
  },
});
const env = {
  DB: {
    prepare: statement,
    async batch(items) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of items) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  },
  ALLOWED_ORIGINS: "https://westcreeper.com",
  TURNSTILE_HOSTNAMES: "westcreeper.com",
  TURNSTILE_SECRET: "test-secret",
  SUBMISSIONS_ENABLED: "true",
  IDENTITY_ENABLED: "true",
  IDENTITY_ORIGIN: "https://community.example.test",
  POST_LIMITER: {
    async limit() {
      return { success: true };
    },
  },
  ACCESS_TEAM: "test-community",
  ACCESS_AUD: "test-aud",
  ADMIN_EMAILS: "owner@example.test",
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      // Model Cloudflare's default canonical redirect for explicit index.html.
      if (path === "/index.html")
        return new Response(null, { status: 307, headers: { Location: "/" } });
      return new Response("admin");
    },
  },
};
const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
jwk.kid = "key-1";
const b64 = (s) => Buffer.from(s).toString("base64url");
async function jwt(override = {}, key = pair.privateKey) {
  const payload = {
    email: "owner@example.test",
    iss: "https://test-community.cloudflareaccess.com",
    aud: ["test-aud"],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...override,
  };
  const head = `${b64(JSON.stringify({ alg: "RS256", kid: "key-1" }))}.${b64(JSON.stringify(payload))}`;
  return `${head}.${b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head)))}`;
}
const adminToken = await jwt();
const originalFetch = globalThis.fetch;
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
  if (String(url).endsWith("/cdn-cgi/access/certs"))
    return Response.json({ keys: [jwk] });
  if (String(url).includes("/siteverify")) {
    const token = JSON.parse(options.body).response;
    return Response.json({
      success: token !== "bad",
      hostname: token === "wrong-host" ? "evil.test" : "westcreeper.com",
      action: token === "wrong-action" ? "other" : "community",
    });
  }
  throw new Error("Unexpected network request");
};
async function call(
  path,
  {
    data,
    admin = false,
    token = adminToken,
    origin,
    customEnv = {},
    method,
    cookie = testCookie,
  } = {},
) {
  const headers = {};
  if (!admin && cookie) headers.Cookie = cookie;
  if (admin) headers["Cf-Access-Jwt-Assertion"] = token;
  if (data) {
    headers["Content-Type"] = "application/json";
    headers.Origin = admin
      ? "https://community.example.test"
      : "https://westcreeper.com";
  }
  if (origin !== undefined) headers.Origin = origin;
  const response = await worker.fetch(
    new Request("https://community.example.test" + path, {
      method: method || (data ? "POST" : "GET"),
      headers,
      body: data ? JSON.stringify(data) : undefined,
    }),
    { ...env, ...customEnv },
  );
  const value = await response.json().catch(() => null);
  return { status: response.status, value, headers: response.headers };
}
const draft = {
  scope: "board",
  category: "find",
  title: "记忆中的游戏",
  nickname: "玩家甲",
  body: "小人可以搬箱子，还记得有很多关卡。",
  token: "valid",
};
const testToken = "a".repeat(64);
const testCookie = "__Host-wc_session=" + testToken;
sqlite
  .prepare(
    "INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES ('12345678',?,'player','test-only',0,0)",
  )
  .run(draft.nickname);
sqlite
  .prepare(
    "INSERT INTO identity_sessions(token_hash,identity_id,credential_version,expires_at,created_at) VALUES (?,1,1,?,0)",
  )
  .run(
    await digest("session", testToken),
    Math.floor(Date.now() / 1000) + 3600,
  );
const latest = () =>
  Number(sqlite.prepare("SELECT MAX(id) AS id FROM entries").get().id);
async function moderate(
  id,
  status,
  progress = "open",
  expected_status = "pending",
  expected_progress = "open",
) {
  return call(`/api/admin/entries/${id}`, {
    admin: true,
    data: {
      expected_revision:
        sqlite.prepare("SELECT revision FROM entries WHERE id=?").get(id)
          ?.revision || 1,
      status,
      progress,
      expected_status,
      expected_progress,
      reason: "测试审核",
    },
  });
}
test.beforeEach(() => sqlite.exec("DELETE FROM identity_limits"));

test("pending → approved → replies → hidden: no private content leaks through public routes", async () => {
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, status: "approved", progress: "done" },
      })
    ).status,
    202,
  );
  const id = latest();
  assert.equal(
    sqlite.prepare("SELECT status FROM entries WHERE id=?").get(id).status,
    "pending",
  );
  assert.equal((await call("/api/entries?scope=board")).value.items.length, 0);
  assert.equal(
    (await call(`/api/entries?scope=board&parent=${id}`)).status,
    404,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, parent_id: id } })).status,
    404,
  );
  assert.equal((await moderate(id, "approved", "working")).status, 200);
  const listed = await call("/api/entries?scope=board&status=pending");
  assert.equal(listed.value.items.length, 1);
  assert.equal(listed.value.items[0].progress, "working");
  assert.equal(listed.headers.get("Cache-Control"), "no-store");
  assert.equal(
    (await call("/api/entries", { data: { ...draft, parent_id: id } })).status,
    202,
  );
  const reply = latest();
  assert.equal(
    (await call(`/api/entries?scope=board&parent=${id}`)).value.items.length,
    0,
  );
  assert.equal((await moderate(reply, "approved")).status, 200);
  assert.equal(
    (await call("/api/entries?scope=board")).value.items[0].replies,
    1,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, parent_id: reply } }))
      .status,
    404,
  );
  assert.equal(
    (await moderate(id, "hidden", "working", "approved", "working")).status,
    200,
  );
  assert.equal((await call("/api/entries?scope=board")).value.items.length, 0);
  assert.equal(
    (await call(`/api/entries?scope=board&parent=${id}`)).status,
    404,
  );
  assert.equal(
    (await moderate(reply, "approved", "done", "approved")).status,
    409,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_log").get().n,
    3,
  );
});
test("games are isolated, invalid IDs cannot create arbitrary threads", async () => {
  const game = "game:dadnme";
  assert.equal(
    (await call("/api/entries", { data: { ...draft, scope: game } })).status,
    202,
  );
  const id = latest();
  await moderate(id, "approved");
  assert.equal(
    (await call(`/api/entries?scope=${game}`)).value.items.length,
    1,
  );
  assert.equal(
    (await call("/api/entries?scope=game:the-heist-2")).value.items.length,
    0,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, scope: "game:not-real" } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, scope: "board", parent_id: id },
      })
    ).status,
    404,
  );
});
test("Turnstile, origin, limits, lengths and disabled configuration fail closed", async () => {
  for (const token of ["bad", "wrong-host", "wrong-action"])
    assert.equal(
      (await call("/api/entries", { data: { ...draft, token } })).status,
      400,
    );
  assert.equal(
    (await call("/api/entries", { data: draft, origin: "https://evil.test" }))
      .status,
    403,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: draft,
        customEnv: {
          POST_LIMITER: {
            async limit() {
              return { success: false };
            },
          },
        },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: draft,
        customEnv: { TURNSTILE_SECRET: "" },
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: draft,
        customEnv: { SUBMISSIONS_ENABLED: "false" },
      })
    ).status,
    503,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, nickname: "   " } }))
      .status,
    202,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, body: "x".repeat(2001) } }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, body: "x".repeat(17000) },
      })
    ).status,
    413,
  );
  assert.equal(
    (await call("/api/entries?scope=board&before=oops")).status,
    400,
  );
  assert.equal(
    (
      await call("/api/entries?scope=board", {
        origin: "https://westcreeper.com",
      })
    ).headers.get("Access-Control-Allow-Origin"),
    "https://westcreeper.com",
  );
  assert.equal(
    (
      await call("/api/entries", {
        method: "OPTIONS",
        origin: "https://westcreeper.com",
      })
    ).status,
    204,
  );
});
test("moderation requires signed Access JWT, approved email, audience, issuer and same-origin POST", async () => {
  for (const path of ["/admin", "/admin/admin.js", "/api/admin/entries"])
    assert.equal((await call(path)).status, 403);
  for (const override of [
    { email: "visitor@example.test" },
    { aud: ["other"] },
    { iss: "https://evil.test" },
    { exp: 1 },
    { nbf: Date.now() / 1000 + 5000 },
  ])
    assert.equal(
      (
        await call("/api/admin/entries", {
          admin: true,
          token: await jwt(override),
        })
      ).status,
      403,
    );
  const forged = adminToken.slice(0, -20) + "A".repeat(20);
  assert.equal(
    (await call("/api/admin/entries", { admin: true, token: forged })).status,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/entries", {
        admin: true,
        customEnv: { ACCESS_AUD: "" },
      })
    ).status,
    403,
  );
  assert.equal((await call("/api/admin/entries", { admin: true })).status, 200);
  assert.equal(
    (
      await call("/api/admin/entries/1", {
        admin: true,
        data: { status: "approved" },
        origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal((await call("/admin/admin.js", { admin: true })).status, 200);
});
test("authenticated admin home does not redirect outside the protected path", async () => {
  for (const path of ["/admin", "/admin/", "/admin/index.html"]) {
    const response = await call(path, { admin: true });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("location"), null, path);
  }
});
test("pagination has no overlap; moderation conflicts do not create audit records", async () => {
  for (let i = 0; i < 23; i++)
    sqlite
      .prepare(
        "INSERT INTO entries(scope,category,title,nickname,body,status) VALUES ('board','chat','分页','访客','测试内容','approved')",
      )
      .run();
  const one = (await call("/api/entries?scope=board&category=chat")).value;
  assert.equal(one.items.length, 20);
  assert.ok(one.next);
  const two = (
    await call(`/api/entries?scope=board&category=chat&before=${one.next}`)
  ).value;
  assert.equal(two.items.length, 3);
  assert.equal(two.next, null);
  assert.equal(new Set([...one.items, ...two.items].map((i) => i.id)).size, 23);
  const before = sqlite
    .prepare("SELECT COUNT(*) AS n FROM moderation_log")
    .get().n;
  assert.equal((await moderate(latest(), "rejected")).status, 409);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_log").get().n,
    before,
  );
});
test("client nickname and role cannot override the signed-in author or moderation", async () => {
  for (const nickname of ["西部苦力怕", "WestCreeper", "站长", "管理员"]) {
    const response = await call("/api/entries", {
      data: { ...draft, nickname, status: "approved", role: "admin" },
    });
    assert.equal(response.status, 202, nickname);
    const id = latest();
    const row = sqlite
      .prepare("SELECT nickname,status FROM entries WHERE id=?")
      .get(id);
    assert.equal(row.nickname, draft.nickname);
    assert.equal(row.status, "pending");
    const publicEntries = (await call("/api/entries?scope=board")).value.items;
    assert.ok(!publicEntries.some((entry) => entry.id === id));
  }
  assert.equal((await call("/api/admin/entries")).status, 403);
  const rejected = await call("/api/entries", {
    data: { ...draft, nickname: "西部苦力怕", token: "bad" },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.value.error, /人机验证/);
});

test("unified feed filters games and board categories without leaking pending or hidden content", async () => {
  const all = (await call("/api/entries?scope=all")).value;
  assert.equal(all.items.length, 20);
  const next = (await call(`/api/entries?scope=all&before=${all.next}`)).value;
  assert.equal(
    new Set([...all.items, ...next.items].map((i) => i.id)).size,
    all.items.length + next.items.length,
  );
  const game = (await call("/api/entries?scope=all&category=game")).value.items;
  assert.ok(game.length);
  assert.ok(game.every((i) => i.scope.startsWith("game:")));
  assert.deepEqual((await call("/api/entries?scope=games")).value.items, game);
  assert.equal(
    (await call("/api/entries?scope=all&category=find")).value.items.length,
    0,
  );
  assert.equal((await call("/api/entries?scope=all&parent=1")).status, 400);
  assert.equal(
    (await call("/api/entries", { data: { ...draft, scope: "all" } })).status,
    400,
  );
});
test("admin edits are validated, audited, conflict-safe and preserve approval status", async () => {
  await call("/api/entries", { data: draft });
  const id = latest();
  await moderate(id, "approved");
  await call("/api/entries", { data: { ...draft, parent_id: id } });
  const reply = latest();
  const edit = {
    action: "edit",
    expected_revision: 2,
    nickname: draft.nickname,
    title: "修正标题",
    body: "<script>文本不会作为 HTML 执行</script>",
    category: "feedback",
    reason: "修正分类",
  };
  assert.equal(
    (await call(`/api/admin/entries/${id}`, { data: edit })).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/admin/entries/${id}`, {
        admin: true,
        data: { ...edit, body: "x" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/api/admin/entries/${id}`, { admin: true, data: edit }))
      .status,
    200,
  );
  const row = sqlite.prepare("SELECT * FROM entries WHERE id=?").get(id);
  assert.equal(row.revision, 3);
  assert.equal(row.status, "approved");
  assert.equal(row.body, edit.body);
  assert.equal(
    sqlite
      .prepare("SELECT category,revision FROM entries WHERE id=?")
      .get(reply).category,
    "feedback",
  );
  const logs = sqlite
    .prepare("SELECT * FROM content_log WHERE entry_id=?")
    .all(id);
  assert.equal(logs.length, 1);
  assert.equal(JSON.parse(logs[0].before_json).nickname, draft.nickname);
  assert.equal(
    (await call(`/api/admin/entries/${id}`, { admin: true, data: edit }))
      .status,
    409,
  );
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM content_log WHERE entry_id=?")
      .get(id).n,
    1,
  );
  const stale = await call(`/api/admin/entries/${id}`, {
    admin: true,
    data: {
      expected_revision: 2,
      status: "hidden",
      progress: "open",
      expected_status: "approved",
      expected_progress: "open",
    },
  });
  assert.equal(stale.status, 409);
  const filtered = await call(
    "/api/admin/entries?status=all&category=feedback&kind=topic&progress=open&q=玩家甲&scope=board",
    { admin: true },
  );
  assert.deepEqual(
    filtered.value.items.map((i) => i.id),
    [id],
  );
  assert.equal(
    (
      await call("/api/admin/entries?status=all&kind=reply&category=feedback", {
        admin: true,
      })
    ).value.items[0].id,
    reply,
  );
  assert.equal(
    (await call("/api/admin/entries?status=all&q=%25", { admin: true })).value
      .items.length,
    0,
  );
  for (const query of [
    "category=invalid",
    "kind=invalid",
    "scope=game:invalid",
    "progress=invalid",
  ])
    assert.equal(
      (await call("/api/admin/entries?" + query, { admin: true })).status,
      400,
    );
});
test("deleted threads and replies disappear everywhere and cannot be revived by stale edits", async () => {
  await call("/api/entries", { data: draft });
  const id = latest();
  await moderate(id, "approved");
  await call("/api/entries", { data: { ...draft, parent_id: id } });
  const reply = latest();
  await moderate(reply, "approved");
  const deleteReply = { action: "delete", expected_revision: 2 };
  assert.equal(
    (
      await call(`/api/admin/entries/${reply}`, {
        admin: true,
        data: deleteReply,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call(`/api/entries?scope=board&parent=${id}`)).value.items.length,
    0,
  );
  assert.equal(
    (await call("/api/entries?scope=all")).value.items.find((i) => i.id === id)
      .replies,
    0,
  );
  await call("/api/entries", { data: { ...draft, parent_id: id } });
  const child = latest();
  await moderate(child, "approved");
  assert.equal(
    (
      await call(`/api/admin/entries/${id}`, {
        admin: true,
        data: { action: "delete", expected_revision: 2 },
      })
    ).status,
    200,
  );
  for (const feed of ["board", "all"])
    assert.ok(
      !(await call("/api/entries?scope=" + feed)).value.items.some(
        (i) => i.id === id,
      ),
    );
  assert.equal(
    (await call(`/api/entries?scope=board&parent=${id}`)).status,
    404,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, parent_id: id } })).status,
    404,
  );
  assert.ok(
    !(
      await call("/api/admin/entries?status=all", { admin: true })
    ).value.items.some((i) => [id, child, reply].includes(i.id)),
  );
  assert.equal(
    (await moderate(child, "approved", "open", "approved")).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/admin/entries/${id}`, {
        admin: true,
        data: { action: "edit", expected_revision: 3, ...draft },
      })
    ).status,
    409,
  );
  assert.ok(
    sqlite.prepare("SELECT deleted_at FROM entries WHERE id=?").get(child)
      .deleted_at,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM content_log WHERE entry_id=? AND action='delete'",
      )
      .get(id).n,
    1,
  );
});

test.after(() => {
  globalThis.fetch = originalFetch;
  sqlite.close();
});

test("published articles have isolated moderated threads, board filters, replies and reactions", async () => {
  const article = "article:/2021/02/26/test-article";
  const other = "article:/2023/12/29/second";
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, scope: article, category: "game" },
      })
    ).status,
    202,
  );
  const id = latest();
  assert.equal(
    sqlite.prepare("SELECT category FROM entries WHERE id=?").get(id).category,
    "article",
  );
  assert.equal(
    (await call("/api/entries?scope=" + article)).value.items.length,
    0,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, scope: "article:invented" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/entries", { data: { ...draft, category: "article" } }))
      .status,
    400,
  );
  const queue = await call("/api/admin/entries?category=article", {
    admin: true,
  });
  assert.equal(queue.value.items[0].id, id);
  assert.equal(queue.value.items[0].source.title, "测试文章");
  assert.equal((await moderate(id, "approved")).status, 200);
  assert.equal(
    (await call("/api/entries?scope=" + other)).value.items.length,
    0,
  );
  assert.equal(
    (await call("/api/entries?scope=all&category=article")).value.items[0].id,
    id,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, scope: other, parent_id: id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/entries", {
        data: { ...draft, scope: article, parent_id: id },
      })
    ).status,
    202,
  );
  const reply = latest();
  assert.equal((await moderate(reply, "approved")).status, 200);
  assert.equal(
    (await call("/api/entries?scope=" + article + "&parent=" + id)).value
      .items[0].id,
    reply,
  );
  assert.equal(
    (
      await call("/api/entries/" + reply + "/reactions", {
        data: { reaction: "love" },
      })
    ).status,
    200,
  );
  const revision = sqlite
    .prepare("SELECT revision FROM entries WHERE id=?")
    .get(id).revision;
  assert.equal(
    (
      await call("/api/admin/entries/" + id, {
        admin: true,
        data: {
          action: "edit",
          expected_revision: revision,
          nickname: draft.nickname,
          body: "修正后的文章评论",
          category: "game",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    sqlite.prepare("SELECT category FROM entries WHERE id=?").get(id).category,
    "article",
  );
  assert.equal((await moderate(id, "hidden", "open", "approved")).status, 200);
  assert.equal(
    (await call("/api/entries/" + reply + "/reactions")).status,
    404,
  );
  assert.equal(
    (await call("/api/entries?scope=all&category=article")).value.items.length,
    0,
  );
});

test("notification events are atomic, private, deduplicated and bounded by a read snapshot", async () => {
  const secondId = Number(
    sqlite
      .prepare(
        "INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at) VALUES ('87654321','通知玩家','notice-player','notice-test',0,0)",
      )
      .run().lastInsertRowid,
  );
  const secondToken = "b".repeat(64),
    secondCookie = "__Host-wc_session=" + secondToken;
  sqlite
    .prepare(
      "INSERT INTO identity_sessions(token_hash,identity_id,credential_version,expires_at,created_at) VALUES (?,?,1,?,0)",
    )
    .run(
      await digest("session", secondToken),
      secondId,
      Math.floor(Date.now() / 1000) + 3600,
    );
  const seed = (author, parent = null) =>
    Number(
      sqlite
        .prepare(
          "INSERT INTO entries(scope,category,nickname,body,author_id,parent_id) VALUES ('board','chat','通知玩家','不应提前公开的测试内容',?,?)",
        )
        .run(author, parent).lastInsertRowid,
    );
  const topic = seed(1);
  assert.equal((await moderate(topic, "approved")).status, 200);
  const reply = seed(secondId, topic);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) n FROM notifications WHERE entry_id=?")
      .get(reply).n,
    0,
  );
  const revision = sqlite
    .prepare("SELECT revision FROM entries WHERE id=?")
    .get(reply).revision;
  assert.equal((await moderate(reply, "approved")).status, 200);
  const count = () =>
    sqlite
      .prepare("SELECT COUNT(*) n FROM notifications WHERE entry_id=?")
      .get(reply).n;
  assert.equal(count(), 2);
  assert.equal(
    (
      await call("/api/admin/entries/" + reply, {
        admin: true,
        data: {
          status: "approved",
          progress: "open",
          expected_status: "pending",
          expected_progress: "open",
          expected_revision: revision,
        },
      })
    ).status,
    409,
  );
  assert.equal(count(), 2);
  assert.equal(
    (await moderate(reply, "approved", "working", "approved")).status,
    200,
  );
  assert.equal(count(), 2, "progress-only changes do not notify");
  const ownReply = seed(1, topic);
  await moderate(ownReply, "approved");
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) n FROM notifications WHERE entry_id=? AND kind='reply'",
      )
      .get(ownReply).n,
    0,
    "no self reply notification",
  );
  const api = "/api/identity/notifications";
  assert.equal((await call(api, { cookie: "" })).status, 401);
  assert.equal(
    (
      await call(api + "/read", {
        cookie: "",
        data: { id: 1, owner: "12345678" },
      })
    ).status,
    401,
  );
  let result = await call(api);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(result.value.owner, "12345678");
  const alert = result.value.items.find((n) => n.entry_id === reply);
  assert.equal(alert.kind, "reply");
  for (const item of result.value.items) {
    for (const key of [
      "moderator",
      "reason",
      "recipient_id",
      "event_key",
      "recovery_hash",
    ])
      assert.equal(key in item, false);
  }
  const authorAlert = (
    await call(api, { cookie: secondCookie })
  ).value.items.find((n) => n.entry_id === reply);
  assert.equal(authorAlert.kind, "review");
  assert.equal(
    (
      await call(api + "/read", {
        cookie: secondCookie,
        data: { id: alert.id, owner: "87654321" },
      })
    ).status,
    200,
  );
  assert.equal(
    sqlite.prepare("SELECT read_at FROM notifications WHERE id=?").get(alert.id)
      .read_at,
    null,
    "cannot mark another identity notification",
  );
  assert.equal(
    (await call(api + "/read", { data: { id: alert.id, owner: "87654321" } }))
      .status,
    409,
    "stale account cannot mark read",
  );
  await moderate(reply, "hidden", "working", "approved", "working");
  assert.ok(!(await call(api)).value.items.some((n) => n.entry_id === reply));
  await moderate(reply, "approved", "working", "hidden", "working");
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) n FROM notifications WHERE entry_id=? AND kind='reply'",
      )
      .get(reply).n,
    1,
  );
  await moderate(topic, "hidden", "open", "approved");
  assert.ok(
    !(await call(api)).value.items.some(
      (n) => n.kind === "reply" && n.entry_id === reply,
    ),
  );
  await moderate(topic, "approved", "open", "hidden");
  const snapshot = (await call(api + "/unread")).value.through;
  const later = seed(1);
  await moderate(later, "rejected");
  await call(api + "/read", { data: { through: snapshot, owner: "12345678" } });
  result = await call(api + "?filter=unread");
  assert.deepEqual(
    result.value.items.map((n) => n.entry_id),
    [later],
  );
  assert.equal(result.value.unread, 1, "new notifications survive mark all");
  assert.equal(
    (
      await call(api + "/read", {
        data: { id: alert.id, through: snapshot, owner: "12345678" },
      })
    ).status,
    400,
  );
  for (let i = 0; i < 22; i++) {
    const id = seed(secondId);
    await moderate(id, "rejected");
  }
  const first = (await call(api, { cookie: secondCookie })).value;
  const next = (
    await call(api + "?before=" + first.next, { cookie: secondCookie })
  ).value;
  assert.equal(first.items.length, 20);
  assert.ok(next.items.every((n) => n.id < first.next));
  sqlite
    .prepare("UPDATE entries SET deleted_at='2026-10-03' WHERE id=?")
    .run(topic);
  assert.ok(
    !(await call(api)).value.items.some(
      (n) => n.entry_id === topic || n.parent_id === topic,
    ),
    "deleted root and its replies vanish",
  );
  sqlite
    .prepare("UPDATE identities SET state='banned' WHERE id=?")
    .run(secondId);
  assert.equal((await call(api, { cookie: secondCookie })).status, 403);
});
