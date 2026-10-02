import PostalMime from "postal-mime";
import { fail, json, body, number, text } from "./http.mjs";
import { digest, limit } from "./identity.mjs";
export async function receiveMail(message, env) {
  if (
    !env.CONTACT_EMAIL ||
    message.to.toLowerCase() !== env.CONTACT_EMAIL.toLowerCase()
  ) {
    message.setReject("Unknown recipient");
    return;
  }
  if (message.rawSize > 524288) {
    message.setReject(
      "Please send a text email smaller than 512 KiB, without attachments.",
    );
    return;
  }
  const reader = message.raw.getReader(),
    parts = [];
  let size = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 524288) {
      await reader.cancel();
      message.setReject("Message too large");
      return;
    }
    parts.push(r.value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    raw.set(part, offset);
    offset += part.length;
  }
  const fingerprint = await digest(
    "mail",
    new TextDecoder("latin1").decode(raw),
  );
  if (
    await env.DB.prepare("SELECT id FROM inbox WHERE fingerprint=?")
      .bind(fingerprint)
      .first()
  )
    return;
  try {
    await limit(env, "inbox:all", 200, 86400);
    await limit(
      env,
      "inbox:" + (await digest("sender", message.from)),
      20,
      3600,
    );
  } catch (e) {
    if (e.status === 429) {
      message.setReject("Mailbox rate limit reached; please retry later.");
      return;
    }
    throw e;
  }
  let mail;
  try {
    mail = await PostalMime.parse(raw);
  } catch {
    message.setReject("Unable to parse MIME message; please send plain text.");
    return;
  }
  // Never render HTML or load remote images. Attachments are counted, not stored.
  const content =
    mail.text ||
    (mail.html
      ? "此邮件仅含 HTML，以下为源码文字（不执行）：\n" + mail.html
      : "(无正文)");
  const truncated =
    content.length > 30000
      ? content.slice(0, 30000) + "\n[正文过长，后续内容未保存]"
      : content;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO inbox(fingerprint,sender,recipient,subject,body,attachment_count,received_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      fingerprint,
      message.from.slice(0, 320),
      message.to.slice(0, 320),
      (mail.subject || "(无主题)").slice(0, 300),
      truncated,
      mail.attachments?.length || 0,
      Math.floor(Date.now() / 1000),
    )
    .run();
}
export async function inboxAdmin(request, env, url, email) {
  if (url.pathname === "/api/admin/inbox" && request.method === "GET") {
    const state = url.searchParams.get("state") || "",
      q = text(url.searchParams.get("q") || "", 0, 100, "关键词"),
      before = number(url.searchParams.get("before"), Number.MAX_SAFE_INTEGER);
    if (state && !["unread", "read", "done"].includes(state))
      fail(400, "状态无效。");
    const { results } = await env.DB.prepare(
      `SELECT id,sender,recipient,subject,body,attachment_count,received_at,state,note,revision FROM inbox WHERE id<? AND (?='' OR state=?) AND (?='' OR instr(lower(sender),lower(?))>0 OR instr(lower(subject),lower(?))>0 OR instr(body,?)>0) ORDER BY id DESC LIMIT 21`,
    )
      .bind(before, state, state, q, q, q, q)
      .all();
    return json({
      items: results.slice(0, 20),
      next: results.length > 20 ? results[19].id : null,
      contact: env.CONTACT_EMAIL || "",
    });
  }
  const match = url.pathname.match(/^\/api\/admin\/inbox\/(\d+)$/);
  if (match && request.method === "POST") {
    const data = await body(request),
      id = number(match[1]),
      revision = number(data.expected_revision);
    if (data.action === "delete") {
      const r = await env.DB.batch([
        env.DB.prepare("DELETE FROM inbox WHERE id=? AND revision=?").bind(
          id,
          revision,
        ),
        env.DB.prepare(
          "INSERT INTO inbox_log(inbox_id,moderator,action,created_at) SELECT ?,?,'delete',? WHERE changes()=1",
        ).bind(id, email, Math.floor(Date.now() / 1000)),
      ]);
      if (!r[0].meta.changes) fail(409, "邮件已更新，请刷新重试。");
    } else {
      if (!["unread", "read", "done"].includes(data.state))
        fail(400, "状态无效。");
      const note = text(data.note || "", 0, 1000, "备注");
      const r = await env.DB.batch([
        env.DB.prepare(
          "UPDATE inbox SET state=?,note=?,revision=revision+1 WHERE id=? AND revision=?",
        ).bind(data.state, note, id, revision),
        env.DB.prepare(
          "INSERT INTO inbox_log(inbox_id,moderator,action,created_at) SELECT ?,?,?,? WHERE changes()=1",
        ).bind(id, email, "mark:" + data.state, Math.floor(Date.now() / 1000)),
      ]);
      if (!r[0].meta.changes) fail(409, "邮件已更新，请刷新重试。");
    }
    return json({ message: "已保存。" });
  }
  fail(404, "页面不存在。");
}
