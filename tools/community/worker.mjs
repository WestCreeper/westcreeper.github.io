import { receiveMail, inboxAdmin } from "./inbox.mjs";
import {
  identityApi,
  identityAdmin,
  visitor,
  limit,
  cleanupIdentities,
} from "./identity.mjs";
import { verifyChallenge } from "./challenge.mjs";
import { HttpError, fail, csv, json, number, text, body } from "./http.mjs";
import gameIds from "./game-ids.json" with { type: "json" };
import { authenticate } from "./auth.mjs";
const games = new Set(gameIds);
const categories = ["feedback", "find", "chat"];
const statuses = ["pending", "approved", "rejected", "hidden"];
const fields =
  "e.id,e.scope,e.parent_id,e.category,e.title,e.nickname,e.body,e.progress,e.created_at,(SELECT public_id FROM identities WHERE id=e.author_id) AS author_code";
const visibleParent =
  "(e.parent_id IS NULL OR EXISTS (SELECT 1 FROM entries p WHERE p.id=e.parent_id AND p.status='approved' AND p.deleted_at IS NULL))";
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
  if (url.pathname.startsWith("/api/identity/"))
    return identityApi(request, env, url);
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
  const identity =
    env.IDENTITY_ENABLED === "true" ? await visitor(request, env, true) : null;
  if (identity && url.origin !== env.IDENTITY_ORIGIN)
    fail(403, "请从正式社区地址投稿。");
  if (identity) await limit(env, "post:" + identity.id, 10, 60);
  const nickname = identity
    ? identity.nickname
    : text(data.nickname, 1, 32, "昵称");
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
  await verifyChallenge(data.token, env);
  // Client-supplied moderation fields are deliberately ignored. The SQL default is pending.
  const result = await env.DB.prepare(
    `INSERT INTO entries(scope,parent_id,category,title,nickname,body,author_id)
    SELECT ?,?,?,?,?,?,? WHERE (? IS NULL OR EXISTS (SELECT 1 FROM entries WHERE id=? AND scope=? AND parent_id IS NULL AND status='approved' AND deleted_at IS NULL)) AND (? IS NULL OR EXISTS (SELECT 1 FROM identities WHERE id=? AND state='active' AND credential_version=?))`,
  )
    .bind(
      s,
      parentId,
      category,
      title,
      nickname,
      message,
      identity?.id || null,
      parentId,
      parentId,
      s,
      identity?.id || null,
      identity?.id || null,
      identity?.credential_version || null,
    )
    .run();
  if (!result.meta.changes) fail(409, "这条讨论已被收起，请刷新页面。");
  return json(
    { message: "已送交审核，通过后会出现在这里。请勿重复提交。" },
    202,
  );
}
async function adminApi(request, env, url, email) {
  if (url.pathname.startsWith("/api/admin/inbox"))
    return inboxAdmin(request, env, url, email);
  if (url.pathname.startsWith("/api/admin/identities"))
    return identityAdmin(request, env, url, email);
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
    const author = url.searchParams.get("author");
    if (author) {
      if (!/^\d{8}$/.test(author)) fail(400, "饼干编号需为 8 位数字。");
      clauses.push("e.author_id=(SELECT id FROM identities WHERE public_id=?)");
      args.push(author);
    }
    const query = text(url.searchParams.get("q") || "", 0, 100, "搜索关键词");
    if (query) {
      clauses.push(
        "(instr(lower(e.nickname),lower(?))>0 OR instr(lower(e.title),lower(?))>0 OR instr(lower(e.body),lower(?))>0)",
      );
      args.push(query, query, query);
    }
    const { results } = await env.DB.prepare(
      `SELECT e.*,(SELECT public_id FROM identities WHERE id=e.author_id) AS author_code,p.title AS parent_title,p.body AS parent_body,p.status AS parent_status FROM entries e LEFT JOIN entries p ON p.id=e.parent_id WHERE ${clauses.join(" AND ")} ORDER BY e.id DESC LIMIT 21`,
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
        if (existing.author_id && nickname !== existing.nickname)
          fail(
            400,
            "饼干留言的昵称快照不能在此冒改，请通过饼干管理处理违规身份。",
          );
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
  async email(message, env) {
    await receiveMail(message, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupIdentities(env));
  },
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
          if (
            !["index.html", "admin.js", "management.js", "admin.css"].includes(
              path,
            )
          )
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
        response.headers.set("Access-Control-Allow-Credentials", "true");
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
