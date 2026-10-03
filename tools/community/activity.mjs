import { fail, json, number } from "./http.mjs";

export async function identityEntries(env, url, who) {
  const view = url.searchParams.get("view") || "mine";
  const status = url.searchParams.get("status") || "all";
  const before = number(
    url.searchParams.get("before"),
    Number.MAX_SAFE_INTEGER,
  );
  if (
    !["mine", "participated"].includes(view) ||
    !["all", "pending", "approved", "rejected", "hidden"].includes(status)
  )
    fail(400, "记录筛选无效。");
  const publicEntry =
    "e.status='approved' AND e.deleted_at IS NULL AND (e.parent_id IS NULL OR (p.status='approved' AND p.deleted_at IS NULL))";
  const args = [before, who.id];
  let clauses =
    "e.id<? AND e.deleted_at IS NULL AND (e.parent_id IS NULL OR p.deleted_at IS NULL)";
  if (view === "mine") {
    clauses += " AND e.author_id=?";
    if (status !== "all") {
      clauses += " AND e.status=?";
      args.push(status);
    }
  } else {
    // Only approved public threads, never someone else's pending reply or draft.
    clauses += ` AND e.parent_id IS NULL AND ${publicEntry} AND (e.author_id=? OR EXISTS(SELECT 1 FROM entries r WHERE r.parent_id=e.id AND r.author_id=? AND r.status='approved' AND r.deleted_at IS NULL))`;
    args.push(who.id);
  }
  const { results } = await env.DB.prepare(
    `SELECT e.id,e.parent_id,e.scope,e.category,e.title,e.body,e.nickname,e.created_at,e.status,CASE WHEN ${publicEntry} THEN 1 ELSE 0 END AS is_public FROM entries e LEFT JOIN entries p ON p.id=e.parent_id WHERE ${clauses} ORDER BY e.id DESC LIMIT 21`,
  )
    .bind(...args)
    .all();
  const items = results.slice(0, 20);
  return json({ items, next: results.length > 20 ? items.at(-1).id : null });
}
