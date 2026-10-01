import gameIds from "./game-ids.json" with { type: "json" };
import { authenticate } from "./auth.mjs";
const games = new Set(gameIds);
const categories = ["feedback", "find", "chat"];
const statuses = ["pending", "approved", "rejected", "hidden"];
const fields =
  "e.id,e.scope,e.parent_id,e.category,e.title,e.nickname,e.body,e.progress,e.created_at";
const visibleParent =
  "(e.parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=e.parent_id AND p.status='approved'))";
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
      "SELECT * FROM entries WHERE id=? AND scope=? AND parent_id IS NULL AND status='approved'",
    )
    .bind(id, targetScope)
    .first();
  if (!p) fail(404, "这条讨论尚未公开或已被收起。");
  return p;
}
async function publicApi(request, env, url) {
  if (url.pathname !== "/api/entries") fail(404, "页面不存在。");
  if (request.method === "GET") {
    const s = scope(url.searchParams.get("scope"));
    const parentId = number(url.searchParams.get("parent"));
    const before = number(
      url.searchParams.get("before"),
      Number.MAX_SAFE_INTEGER,
    );
    const category = url.searchParams.get("category") || "";
    if (category && !categories.includes(category)) fail(400, "分类无效。");
    if (parentId) await parent(env.DB, parentId, s);
    const clauses = [
      "e.scope=?",
      "e.status='approved'",
      "e.id<?",
      visibleParent,
    ];
    const args = [s, before];
    if (parentId) {
      clauses.push("e.parent_id=?");
      args.push(parentId);
    } else clauses.push("e.parent_id IS NULL");
    if (category && s === "board" && !parentId) {
      clauses.push("e.category=?");
      args.push(category);
    }
    const { results } = await env.DB.prepare(
      `SELECT ${fields},(SELECT COUNT(*) FROM entries r WHERE r.parent_id=e.id AND r.status='approved') AS replies FROM entries e WHERE ${clauses.join(" AND ")} ORDER BY e.id DESC LIMIT 21`,
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
  if (/站长|管理员|westcreeper|西部苦力怕/i.test(nickname))
    fail(400, "请使用自己的昵称，站长称呼为保留名称。");
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
    SELECT ?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM entries WHERE id=? AND scope=? AND parent_id IS NULL AND status='approved')`,
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
    if (!statuses.includes(status)) fail(400, "审核状态无效。");
    const before = number(
      url.searchParams.get("before"),
      Number.MAX_SAFE_INTEGER,
    );
    const { results } = await env.DB.prepare(
      `SELECT e.*,p.title AS parent_title,p.body AS parent_body,p.status AS parent_status FROM entries e LEFT JOIN entries p ON p.id=e.parent_id WHERE e.status=? AND e.id<? ORDER BY e.id DESC LIMIT 21`,
    )
      .bind(status, before)
      .all();
    return json({ ...page(results), moderator: email });
  }
  const match = url.pathname.match(/^\/api\/admin\/entries\/(\d+)$/);
  if (match && request.method === "POST") {
    const id = number(match[1]);
    const data = await body(request);
    if (
      !statuses.includes(data.status) ||
      !["open", "working", "done"].includes(data.progress) ||
      !statuses.includes(data.expected_status) ||
      !["open", "working", "done"].includes(data.expected_progress)
    )
      fail(400, "审核状态无效。");
    const reason = text(data.reason || "", 0, 300, "审核备注");
    // Batch keeps the decision and audit trail atomic. Optimistic concurrency avoids stale edits.
    const changed = await env.DB.batch([
      env.DB.prepare(
        `UPDATE entries SET status=?,progress=? WHERE id=? AND status=? AND progress=?
        AND (? != 'approved' OR parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=entries.parent_id AND p.status='approved'))`,
      ).bind(
        data.status,
        data.progress,
        id,
        data.expected_status,
        data.expected_progress,
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
