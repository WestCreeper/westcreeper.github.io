import { fail, json, number, body } from "./http.mjs";

const joins =
  "FROM notifications n JOIN entries e ON e.id=n.entry_id LEFT JOIN entries p ON p.id=e.parent_id";
const visible = `e.deleted_at IS NULL AND (e.parent_id IS NULL OR p.deleted_at IS NULL)
  AND (n.kind='review' OR (e.status='approved' AND p.status='approved'))`;

export async function notificationsApi(request, env, url, who) {
  const path = url.pathname;
  if (
    path === "/api/identity/notifications/read" &&
    request.method === "POST"
  ) {
    const data = await body(request);
    if (data.owner !== who.public_id)
      fail(409, "登录身份已变化，请刷新通知后重试。");
    const id = number(data.id);
    const through = number(data.through);
    if ((!id && !through) || (id && through))
      fail(400, "请选择一条通知，或当前批次的全部通知。");
    // Recipient always comes from the authenticated session, never the request body.
    await env.DB.prepare(
      `UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE recipient_id=? AND read_at IS NULL AND id${id ? "=" : "<="}?`,
    )
      .bind(who.id, id || through)
      .run();
    return json({ owner: who.public_id, message: "已标记为已读。" });
  }
  if (
    request.method !== "GET" ||
    ![
      "/api/identity/notifications",
      "/api/identity/notifications/unread",
    ].includes(path)
  )
    fail(404, "页面不存在。");
  const summary = await env.DB.prepare(
    `SELECT COUNT(CASE WHEN n.read_at IS NULL THEN 1 END) AS unread,COALESCE(MAX(n.id),0) AS through ${joins} WHERE n.recipient_id=? AND ${visible}`,
  )
    .bind(who.id)
    .first();
  if (path.endsWith("/unread"))
    return json({ owner: who.public_id, ...summary });
  const filter = url.searchParams.get("filter") || "all";
  if (!["all", "unread"].includes(filter)) fail(400, "通知筛选无效。");
  const before = number(
    url.searchParams.get("before"),
    Number.MAX_SAFE_INTEGER,
  );
  const { results } = await env.DB.prepare(
    `SELECT n.id,n.kind,n.outcome,n.created_at,n.read_at,e.id AS entry_id,e.parent_id,e.scope,e.title,substr(e.body,1,160) AS excerpt,e.nickname,
    CASE WHEN e.status='approved' AND (e.parent_id IS NULL OR p.status='approved') THEN 1 ELSE 0 END AS is_public
    ${joins} WHERE n.recipient_id=? AND n.id<? AND ${visible} ${filter === "unread" ? "AND n.read_at IS NULL" : ""} ORDER BY n.id DESC LIMIT 21`,
  )
    .bind(who.id, before)
    .all();
  const items = results.slice(0, 20);
  return json({
    owner: who.public_id,
    ...summary,
    items,
    next: results.length > 20 ? items.at(-1).id : null,
  });
}
