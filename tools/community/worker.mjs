import gameIds from "./game-ids.json" with { type: "json" };
import { authenticate } from "./auth.mjs";
const games = new Set(gameIds);
const categories = ["feedback", "find", "chat"];
const statuses = ["pending", "approved", "rejected", "hidden"];
const fields =
  "e.id,e.scope,e.parent_id,e.category,e.title,e.nickname,e.body,e.progress,e.created_at";
const visibleParent =
  "(e.parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=e.parent_id AND p.status='approved' AND p.deleted_at IS NULL))";
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const csv = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    fail(400, "分页或留言编号无效。");
  return Number(value);
}
function scope(value) {
  if (
    value === "board" ||
    (typeof value === "string" &&
      value.startsWith("game:") &&
      games.has(value.slice(5)))
  )
    return value;
  fail(400, "未找到对应的游戏档案。");
}
function text(value, min, max, label) {
  if (typeof value !== "string") fail(400, `请填写${label}。`);
  const s = value.trim();
  if (
    s.length < min ||
    s.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)
  )
    fail(400, `${label}需为 ${min}–${max} 个字符。`);
  return s;
}
async function body(request) {
  if (
    !(request.headers.get("content-type") || "").startsWith("application/json")
  )
    fail(415, "请使用 JSON 提交。");
  if (!request.body) fail(400, "提交内容为空。");
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      fail(413, "提交内容过长。");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    fail(400, "提交格式无效。");
  }
}
function page(rows) {
  const more = rows.length > 20;
  const items = rows.slice(0, 20);
  return { items, next: more ? items.at(-1).id : null };
}
async function parent(db, id, targetScope) {
  const p = await db
    .prepare(
      "SELECT * FROM entries WHERE id=? AND scope=? AND parent_id IS NULL AND status='approved' AND deleted_at IS NULL",
    )
    .bind(id, targetScope)
    .first();
  if (!p) fail(404, "这条讨论尚未公开或已被收起。");
  return p;
}
async function publicApi(request, env, url) {
  if (url.pathname !== "/api/entries") fail(404, "页面不存在。");
  if (request.method === "GET") {
    const requestedScope = url.searchParams.get("scope");
    const s = ["all", "games"].includes(requestedScope)
      ? requestedScope
      : scope(requestedScope);
    const parentId = number(url.searchParams.get("parent"));
    const before = number(
      url.searchParams.get("before"),
      Number.MAX_SAFE_INTEGER,
    );
    const category = url.searchParams.get("category") || "";
    if (category && ![...categories, "game"].includes(category))
      fail(400, "分类无效。");
    if (parentId && ["all", "games"].includes(s))
      fail(400, "请指定回复所属的讨论区。");
    if (parentId) await parent(env.DB, parentId, s);
    const clauses = [
      "e.status='approved'",
      "e.deleted_at IS NULL",
      "e.id<?",
      visibleParent,
    ];
    const args = [before];
    if (s === "games") clauses.push("e.category='game'");
    else if (s !== "all") {
      clauses.push("e.scope=?");
      args.push(s);
    }
    if (parentId) {
      clauses.push("e.parent_id=?");
      args.push(parentId);
    } else clauses.push("e.parent_id IS NULL");
    if (category && !parentId) {
      clauses.push("e.category=?");
      args.push(category);
    }
    const { results } = await env.DB.prepare(
      `SELECT ${fields},(SELECT COUNT(*) FROM entries r WHERE r.parent_id=e.id AND r.status='approved' AND r.deleted_at IS NULL) AS replies FROM entries e WHERE ${clauses.join(" AND ")} ORDER BY e.id DESC LIMIT 21`,
    )
      .bind(...args)
      .all();
    return json(page(results));
  }
  if (request.method !== "POST") fail(405, "不支持此操作。");
  if (env.SUBMISSIONS_ENABLED !== "true")
    fail(503, "暂时停止接收新留言，请稍后再来。");
  if (
    !env.TURNSTILE_SECRET ||
    !env.POST_LIMITER ||
    !csv(env.TURNSTILE_HOSTNAMES).length
  )
    fail(503, "留言服务尚未配置完成。");
  const limited = await env.POST_LIMITER.limit({
    key: request.headers.get("CF-Connecting-IP") || "unknown",
  });
  if (!limited.success) fail(429, "提交过于频繁，请稍等一分钟再试。");
  const data = await body(request);
  const s = scope(data.scope),
    parentId = number(data.parent_id);
  const nickname = text(data.nickname, 1, 32, "昵称");
  // Nicknames are display text only; Access JWTs determine moderator identity.
  const message = text(data.body, 2, 2000, "内容");
  const p = parentId ? await parent(env.DB, parentId, s) : null;
  const category = p ? p.category : s === "board" ? data.category : "game";
  if (
    ![...categories, "game"].includes(category) ||
    (s === "board" && category === "game")
  )
    fail(400, "请选择讨论分类。");
  const title =
    s === "board" && !parentId ? text(data.title, 2, 80, "标题") : "";
  const token = text(data.token, 1, 2048, "人机验证");
  let verified;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) fail(503, "验证服务暂不可用，请稍后重试。");
    verified = await response.json();
  } catch {
    fail(503, "验证服务暂不可用，请稍后重试。");
  }
  if (
    !verified.success ||
    verified.action !== "community" ||
    !csv(env.TURNSTILE_HOSTNAMES).includes(verified.hostname)
  )
    fail(400, "人机验证已失效，请重新验证。");
  // Client-supplied moderation fields are deliberately ignored. The SQL default is pending.
  const result = await env.DB.prepare(
    `INSERT INTO entries(scope,parent_id,category,title,nickname,body)
    SELECT ?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM entries WHERE id=? AND scope=? AND parent_id IS NULL AND status='approved' AND deleted_at IS NULL)`,
  )
    .bind(
      s,
      parentId,
      category,
      title,
      nickname,
      message,
      parentId,
      parentId,
      s,
    )
    .run();
  if (!result.meta.changes) fail(409, "这条讨论已被收起，请刷新页面。");
  return json(
    { message: "已送交审核，通过后会出现在这里。请勿重复提交。" },
    202,
  );
}
async function adminApi(request, env, url, email) {
  if (url.pathname === "/api/admin/entries" && request.method === "GET") {
    const status = url.searchParams.get("status") || "pending";
    if (status !== "all" && !statuses.includes(status))
      fail(400, "审核状态无效。");
    const before = number(
      url.searchParams.get("before"),
      Number.MAX_SAFE_INTEGER,
    );
    const clauses = [
        "e.deleted_at IS NULL",
        "e.id<?",
        "(e.parent_id IS NULL OR p.deleted_at IS NULL)",
      ],
      args = [before];
    if (status !== "all") {
      clauses.push("e.status=?");
      args.push(status);
    }
    const category = url.searchParams.get("category");
    if (category) {
      if (![...categories, "game"].includes(category)) fail(400, "分类无效。");
      clauses.push("e.category=?");
      args.push(category);
    }
    const targetScope = url.searchParams.get("scope");
    if (targetScope) {
      clauses.push("e.scope=?");
      args.push(scope(targetScope));
    }
    const kind = url.searchParams.get("kind");
    if (kind && !["topic", "reply"].includes(kind)) fail(400, "留言类型无效。");
    if (kind)
      clauses.push(
        kind === "topic" ? "e.parent_id IS NULL" : "e.parent_id IS NOT NULL",
      );
    const progress = url.searchParams.get("progress");
    if (progress) {
      if (!["open", "working", "done"].includes(progress))
        fail(400, "处理进度无效。");
      clauses.push("e.progress=?");
      args.push(progress);
    }
    const query = text(url.searchParams.get("q") || "", 0, 100, "搜索关键词");
    if (query) {
      clauses.push(
        "(instr(lower(e.nickname),lower(?))>0 OR instr(lower(e.title),lower(?))>0 OR instr(lower(e.body),lower(?))>0)",
      );
      args.push(query, query, query);
    }
    const { results } = await env.DB.prepare(
      `SELECT e.*,p.title AS parent_title,p.body AS parent_body,p.status AS parent_status FROM entries e LEFT JOIN entries p ON p.id=e.parent_id WHERE ${clauses.join(" AND ")} ORDER BY e.id DESC LIMIT 21`,
    )
      .bind(...args)
      .all();
    return json({ ...page(results), moderator: email });
  }
  const match = url.pathname.match(/^\/api\/admin\/entries\/(\d+)$/);
  if (match && request.method === "POST") {
    const id = number(match[1]);
    const data = await body(request);
    const revision = number(data.expected_revision);
    if (!revision) fail(400, "请刷新后台后再操作。");
    const existing = await env.DB.prepare(
      "SELECT * FROM entries WHERE id=? AND deleted_at IS NULL AND (parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=entries.parent_id AND p.deleted_at IS NULL))",
    )
      .bind(id)
      .first();
    if (!existing || existing.revision !== revision)
      fail(409, "内容已更新或删除，请刷新后重试。");
    const reason = text(data.reason || "", 0, 300, "审核备注");
    if (data.action === "edit" || data.action === "delete") {
      let changed;
      if (data.action === "edit") {
        const nickname = text(data.nickname, 1, 32, "昵称");
        const message = text(data.body, 2, 2000, "内容");
        const title =
          existing.scope === "board" && !existing.parent_id
            ? text(data.title, 2, 80, "标题")
            : "";
        const category =
          existing.scope === "board" && !existing.parent_id
            ? data.category
            : existing.category;
        if (
          ![...categories, "game"].includes(category) ||
          (existing.scope === "board" && category === "game")
        )
          fail(400, "分类无效。");
        const after = { nickname, body: message, title, category };
        changed = await env.DB.batch([
          env.DB.prepare(
            "UPDATE entries SET nickname=?,body=?,title=?,category=?,revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL AND (parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=entries.parent_id AND p.deleted_at IS NULL))",
          ).bind(nickname, message, title, category, id, revision),
          env.DB.prepare(
            "INSERT INTO content_log(entry_id,moderator,action,before_json,after_json,reason) SELECT ?,?,'edit',?,?,? WHERE changes()=1",
          ).bind(
            id,
            email,
            JSON.stringify(existing),
            JSON.stringify(after),
            reason,
          ),
          env.DB.prepare(
            "UPDATE entries SET category=?,revision=revision+1 WHERE parent_id=? AND category!=? AND changes()=1",
          ).bind(category, id, category),
        ]);
      } else {
        // Retain a tombstone and private audit history; deleted threads cannot be restored via moderation.
        changed = await env.DB.batch([
          env.DB.prepare(
            "UPDATE entries SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL",
          ).bind(id, revision),
          env.DB.prepare(
            "INSERT INTO content_log(entry_id,moderator,action,before_json,after_json,reason) SELECT ?,?,'delete',?,'{}',? WHERE changes()=1",
          ).bind(id, email, JSON.stringify(existing), reason),
          env.DB.prepare(
            "UPDATE entries SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE parent_id=? AND deleted_at IS NULL AND changes()=1",
          ).bind(id),
        ]);
      }
      if (!changed[0].meta.changes) fail(409, "内容已更新，请刷新后重试。");
      return json({
        message:
          data.action === "delete" ? "已删除留言及其回复。" : "已保存编辑。",
        revision: revision + 1,
      });
    }
    if (data.action && data.action !== "moderate") fail(400, "操作无效。");
    if (
      !statuses.includes(data.status) ||
      !["open", "working", "done"].includes(data.progress) ||
      !statuses.includes(data.expected_status) ||
      !["open", "working", "done"].includes(data.expected_progress)
    )
      fail(400, "审核状态无效。");
    // Batch keeps the decision and audit trail atomic. Optimistic concurrency avoids stale edits.
    const changed = await env.DB.batch([
      env.DB.prepare(
        `UPDATE entries SET status=?,progress=?,revision=revision+1 WHERE id=? AND status=? AND progress=? AND revision=? AND deleted_at IS NULL
        AND (parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=entries.parent_id AND p.deleted_at IS NULL))
        AND (? != 'approved' OR parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=entries.parent_id AND p.status='approved' AND p.deleted_at IS NULL))`,
      ).bind(
        data.status,
        data.progress,
        id,
        data.expected_status,
        data.expected_progress,
        revision,
        data.status,
      ),
      env.DB.prepare(
        `INSERT INTO moderation_log(entry_id,moderator,old_status,new_status,old_progress,new_progress,reason)
        SELECT ?,?,?,?,?,?,? WHERE changes()=1`,
      ).bind(
        id,
        email,
        data.expected_status,
        data.status,
        data.expected_progress,
        data.progress,
        reason,
      ),
    ]);
    if (!changed[0].meta.changes)
      fail(409, "内容已被其他操作更新，或原帖尚未公开。请刷新后再审核。");
    return json({ message: "已保存审核结果。" });
  }
  fail(404, "页面不存在。");
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const admin =
      url.pathname === "/admin" ||
      url.pathname.startsWith("/admin/") ||
      url.pathname.startsWith("/api/admin/");
    const origin = request.headers.get("Origin");
    const allowed = csv(env.ALLOWED_ORIGINS).includes(origin);
    let response;
    try {
      if (admin) {
        const email = await authenticate(request, env);
        if (!email)
          fail(403, "请通过 Cloudflare Access 登录已授权的管理员账户。");
        if (request.method !== "GET" && origin !== url.origin)
          fail(403, "请从审核后台发起操作。");
        if (url.pathname.startsWith("/api/admin/"))
          response = await adminApi(request, env, url, email);
        else {
          if (request.method !== "GET") fail(405, "不支持此操作。");
          const path = url.pathname.replace(/^\/admin\/?/, "") || "index.html";
          if (!["index.html", "admin.js", "admin.css"].includes(path))
            fail(404, "页面不存在。");
          // Ask for the canonical asset URL. /index.html redirects to / and
          // would otherwise send the browser outside the protected /admin path.
          url.pathname = path === "index.html" ? "/" : "/" + path;
          response = await env.ASSETS.fetch(new Request(url, request));
        }
      } else {
        if ((origin && !allowed) || (request.method !== "GET" && !allowed))
          fail(403, "请从博客页面提交。");
        if (request.method === "OPTIONS")
          response = new Response(null, { status: 204 });
        else response = await publicApi(request, env, url);
      }
    } catch (error) {
      response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "服务暂不可用，请稍后重试。",
        },
        error instanceof HttpError ? error.status : 503,
      );
    }
    response = new Response(response.body, response);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (admin)
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    else {
      response.headers.set("Vary", "Origin");
      if (allowed) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set(
          "Access-Control-Allow-Methods",
          "GET,POST,OPTIONS",
        );
        response.headers.set("Access-Control-Allow-Headers", "Content-Type");
      }
    }
    return response;
  },
};
