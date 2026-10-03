import { fail, json, body, number } from "./http.mjs";
import { visitor, limit } from "./identity.mjs";
import catalog from "../../_data/community_reactions.json" with { type: "json" };
const allowed = new Set(catalog.map((r) => r.key));
const visible =
  "e.status='approved' AND e.deleted_at IS NULL AND (e.parent_id IS NULL OR EXISTS(SELECT 1 FROM entries p WHERE p.id=e.parent_id AND p.status='approved' AND p.deleted_at IS NULL))";
export async function addReactions(env, items, viewer) {
  if (!items.length) return items;
  const ids = items.map((e) => e.id);
  const { results } = await env.DB.prepare(
    `SELECT r.entry_id,r.reaction,COUNT(*) AS count,MAX(CASE WHEN r.identity_id=? THEN 1 ELSE 0 END) AS mine FROM entry_reactions r JOIN identities i ON i.id=r.identity_id AND i.state='active' WHERE r.entry_id IN (${ids.map(() => "?").join(",")}) GROUP BY r.entry_id,r.reaction`,
  )
    .bind(viewer?.id || 0, ...ids)
    .all();
  return items.map((e) => ({
    ...e,
    reactions_owner: viewer?.public_id || null,
    reactions: results
      .filter((r) => r.entry_id === e.id)
      .map((r) => ({ key: r.reaction, count: r.count, mine: !!r.mine })),
  }));
}
export async function react(request, env, url) {
  if (request.method === "GET") {
    const id = number(url.pathname.split("/")[3]);
    const reaction = url.searchParams.get("reaction") || "";
    const after = url.searchParams.get("after") || "";
    if (
      (reaction && !allowed.has(reaction)) ||
      (after && !/^\d{8}$/.test(after))
    )
      fail(400, "回应筛选或分页无效。");
    if (
      !(await env.DB.prepare(
        `SELECT e.id FROM entries e WHERE e.id=? AND ${visible}`,
      )
        .bind(id)
        .first())
    )
      fail(404, "这条留言尚未公开或已被收起。");
    const { results } = await env.DB.prepare(
      `SELECT i.public_id,i.nickname,r.reaction FROM entry_reactions r JOIN identities i ON i.id=r.identity_id AND i.state='active' JOIN entries e ON e.id=r.entry_id WHERE e.id=? AND ${visible} AND i.public_id>? ${reaction ? "AND r.reaction=?" : ""} ORDER BY i.public_id LIMIT 21`,
    )
      .bind(id, after, ...(reaction ? [reaction] : []))
      .all();
    const items = results.slice(0, 20);
    return json({
      items,
      next: results.length > 20 ? items.at(-1).public_id : null,
    });
  }
  if (request.method !== "POST") fail(405, "不支持此操作。");
  if (env.IDENTITY_ENABLED !== "true" || env.SUBMISSIONS_ENABLED !== "true")
    fail(503, "暂时停止接收新回应。");
  if (url.origin !== env.IDENTITY_ORIGIN) fail(403, "请从正式社区地址回应。");
  const who = await visitor(request, env, true);
  if (
    !env.POST_LIMITER ||
    !(
      await env.POST_LIMITER.limit({
        key:
          "reaction:" + (request.headers.get("CF-Connecting-IP") || "unknown"),
      })
    ).success
  )
    fail(429, "回应过于频繁，请稍后再试。");
  await limit(env, "reaction:" + who.id, 30, 60);
  await limit(env, "reaction-day:" + who.id, 1000, 86400);
  const id = number(url.pathname.split("/")[3]);
  const data = await body(request);
  if (data.reaction !== null && !allowed.has(data.reaction))
    fail(400, "请选择提供的表情。");
  const check = () =>
    env.DB.prepare(`SELECT e.id FROM entries e WHERE e.id=? AND ${visible}`)
      .bind(id)
      .first();
  if (!(await check())) fail(404, "这条留言尚未公开或已被收起。");
  if (data.reaction === null) {
    await env.DB.prepare(
      `DELETE FROM entry_reactions WHERE entry_id=? AND identity_id=? AND EXISTS(SELECT 1 FROM entries e WHERE e.id=? AND ${visible}) AND EXISTS(SELECT 1 FROM identities WHERE id=? AND state='active' AND credential_version=?)`,
    )
      .bind(id, who.id, id, who.id, who.credential_version)
      .run();
  } else {
    const r = await env.DB.prepare(
      `INSERT INTO entry_reactions(entry_id,identity_id,reaction,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM entries e WHERE e.id=? AND ${visible}) AND EXISTS(SELECT 1 FROM identities WHERE id=? AND state='active' AND credential_version=?) ON CONFLICT(entry_id,identity_id) DO UPDATE SET reaction=excluded.reaction,updated_at=excluded.updated_at`,
    )
      .bind(
        id,
        who.id,
        data.reaction,
        Math.floor(Date.now() / 1000),
        id,
        who.id,
        who.credential_version,
      )
      .run();
    if (!r.meta.changes) fail(409, "留言或身份状态已更新，请刷新。");
  }
  if (!(await check())) fail(404, "这条留言已被收起。");
  await visitor(request, env, true);
  return json((await addReactions(env, [{ id }], who))[0]);
}
