import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "./worker.mjs";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  readFileSync(new URL("migrations/0001_initial.sql", import.meta.url), "utf8"),
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
  } = {},
) {
  const headers = {};
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
      status,
      progress,
      expected_status,
      expected_progress,
      reason: "测试审核",
    },
  });
}
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
    (await call("/api/entries", { data: { ...draft, nickname: "站长" } }))
      .status,
    400,
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
test.after(() => {
  globalThis.fetch = originalFetch;
  sqlite.close();
});
