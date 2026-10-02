import { fail, json, text, body, number } from "./http.mjs";
import { verifyChallenge } from "./challenge.mjs";
import avatarCatalog from "../../_data/community_avatars.json" with { type: "json" };
const avatars = new Set(avatarCatalog.map((a) => a.id));
function availableName(name, owner = false) {
  if (!owner && name.key === "西部苦力怕")
    fail(409, "这是站长的专属昵称，请选择其他昵称。");
}
const DAY = 86400,
  COOKIE = "__Host-wc_session";
const now = () => Math.floor(Date.now() / 1000);
const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async (purpose, value) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(purpose + ":" + value),
      ),
    ),
  );
export function nickname(value) {
  const display = text(value, 2, 32, "昵称")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  if (
    [...display].length < 2 ||
    [...display].length > 24 ||
    !/^[\p{L}\p{M}\p{N} _·-]+$/u.test(display)
  )
    fail(400, "昵称需为 2–24 字，可使用文字、数字、空格、下划线和短横线。");
  return { display, key: display.toLowerCase().replace(/\s/gu, "") };
}
function cookie(value, age = 30 * DAY) {
  return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}
function readCookie(request) {
  const values = (request.headers.get("Cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(COOKIE + "="));
  return values.length === 1 &&
    /^[a-f0-9]{64}$/.test(values[0].slice(COOKIE.length + 1))
    ? values[0].slice(COOKIE.length + 1)
    : null;
}
function publicIdentity(row) {
  return {
    public_id: row.public_id,
    avatar: avatars.has(row.avatar) ? row.avatar : "moss",
    is_owner: row.public_id === "00000000",
    nickname: row.nickname,
    state: row.state,
    created_at: row.created_at,
    rename_after: row.nickname_changed_at + 7 * DAY,
    revision: row.revision,
  };
}
export async function visitor(request, env, required = false) {
  const token = readCookie(request);
  const row = token
    ? await env.DB.prepare(
        "SELECT i.*,s.token_hash AS session_hash FROM identity_sessions s JOIN identities i ON i.id=s.identity_id WHERE s.token_hash=? AND s.expires_at>? AND s.credential_version=i.credential_version",
      )
        .bind(await digest("session", token), now())
        .first()
    : null;
  if (required && !row) fail(401, "请先领取饼干或使用恢复码登录。");
  if (required && row.state !== "active")
    fail(403, "此饼干已被停用，请通过联系邮箱申诉。");
  return row;
}
async function ipHash(request, env) {
  if (!env.IDENTITY_PEPPER) fail(503, "饼干服务尚未配置完成。");
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) fail(503, "暂时无法确认请求来源，请稍后重试。");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.IDENTITY_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)),
    ),
  );
}
export async function limit(env, key, max, seconds) {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO identity_limits(key,count,expires_at) VALUES (?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END
 WHERE expires_at<=? OR count<? RETURNING count`,
  )
    .bind(key, t + seconds, t, t, t + seconds, t, max)
    .first();
  if (!row) fail(429, "操作过于频繁，请稍后再试。");
}
async function session(env, row) {
  const token = secret(),
    hash = await digest("session", token),
    t = now();
  const r = await env.DB.prepare(
    "INSERT INTO identity_sessions(token_hash,identity_id,credential_version,expires_at,created_at) SELECT ?,id,credential_version,?,? FROM identities WHERE id=? AND credential_version=? AND state='active'",
  )
    .bind(hash, t + 30 * DAY, t, row.id, row.credential_version)
    .run();
  if (!r.meta.changes) fail(409, "身份状态已更新，请重新登录。");
  return token;
}
function withSession(data, token, status = 200) {
  const r = json(data, status);
  r.headers.set("Set-Cookie", cookie(token));
  return r;
}
function recovery(value) {
  if (typeof value !== "string") fail(400, "请填写恢复码。");
  const code = value.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(code))
    fail(400, "恢复码格式不正确，请完整粘贴保存的恢复码。");
  return code;
}
export async function identityApi(request, env, url) {
  if (env.IDENTITY_ENABLED !== "true")
    return json({ enabled: false, identity: null });
  if (url.origin !== env.IDENTITY_ORIGIN)
    fail(403, "请从博客的正式社区地址使用饼干。");
  const path = url.pathname;
  if (path === "/api/identity/me" && request.method === "GET") {
    const row = await visitor(request, env);
    return json({ enabled: true, identity: row ? publicIdentity(row) : null });
  }
  if (request.method !== "POST") fail(405, "不支持此操作。");
  const data = await body(request);
  if (path === "/api/identity/register" || path === "/api/identity/login") {
    const ip = await ipHash(request, env);
    if (
      !env.POST_LIMITER ||
      !(await env.POST_LIMITER.limit({ key: "identity:" + ip })).success
    )
      fail(429, "操作过于频繁，请稍后再试。");
    await limit(env, "auth:" + ip, 10, 900);
    await verifyChallenge(data.token, env);
    if (path.endsWith("/login")) {
      if (!/^\d{8}$/.test(data.public_id || ""))
        fail(400, "请输入 8 位饼干编号。");
      const hash = await digest("recovery", recovery(data.recovery_code));
      const row = await env.DB.prepare(
        "SELECT * FROM identities WHERE public_id=? AND recovery_hash=? AND state='active'",
      )
        .bind(data.public_id, hash)
        .first();
      if (!row) fail(401, "编号或恢复码不正确，或此饼干已被停用。");
      await limit(env, "sessions:" + row.id, 10, 3600);
      return withSession(
        { identity: publicIdentity(row), message: "已登录。" },
        await session(env, row),
      );
    }
    if (await visitor(request, env))
      fail(409, "此浏览器已有饼干，请直接使用现有身份。");
    if (data.saved_ack !== true) fail(400, "请先确认会妥善保存恢复码。");
    const name = nickname(data.nickname),
      code = secret(),
      hash = await digest("recovery", code),
      t = now();
    availableName(name);
    // One transactional INSERT checks rolling claim quotas. D1 serializes the batch.
    for (let attempt = 0; attempt < 5; attempt++) {
      const n = crypto.getRandomValues(new Uint32Array(1))[0];
      if (n >= Math.floor(2 ** 32 / 90000000) * 90000000) {
        attempt--;
        continue;
      }
      const id = String(10000000 + (n % 90000000)),
        token = secret(),
        sessionHash = await digest("session", token);
      try {
        const result = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO identities(public_id,nickname,nickname_key,recovery_hash,created_at,nickname_changed_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM identity_claims WHERE ip_hash=? AND created_at>?)
      AND (SELECT COUNT(*) FROM identity_claims WHERE ip_hash=? AND created_at>?)<3
      AND (SELECT COUNT(*) FROM identity_claims WHERE created_at>?)<100`,
          ).bind(
            id,
            name.display,
            name.key,
            hash,
            t,
            t,
            ip,
            t - 600,
            ip,
            t - DAY,
            t - DAY,
          ),
          env.DB.prepare(
            "INSERT INTO identity_claims(identity_id,ip_hash,created_at) SELECT id,?,? FROM identities WHERE public_id=? AND changes()=1",
          ).bind(ip, t, id),
          env.DB.prepare(
            "INSERT INTO identity_sessions(token_hash,identity_id,credential_version,expires_at,created_at) SELECT ?,id,credential_version,?,? FROM identities WHERE public_id=? AND changes()=1",
          ).bind(sessionHash, t + 30 * DAY, t, id),
        ]);
        if (!result[0].meta.changes)
          fail(
            429,
            "领取额度暂时用完：同一网络 10 分钟内限 1 个、24 小时内限 3 个，全站 24 小时限 100 个。请稍后再来。",
          );
        const row = await env.DB.prepare(
          "SELECT * FROM identities WHERE public_id=?",
        )
          .bind(id)
          .first();
        return withSession(
          {
            identity: publicIdentity(row),
            recovery_code: code.match(/.{8}/g).join("-"),
            message: "已领取饼干，请立即保存编号和恢复码。恢复码不会再次显示。",
          },
          token,
          201,
        );
      } catch (error) {
        if (
          await env.DB.prepare("SELECT id FROM identities WHERE nickname_key=?")
            .bind(name.key)
            .first()
        )
          fail(409, "这个昵称已经被使用，请换一个。");
        if (
          String(error).includes(
            "UNIQUE constraint failed: identities.public_id",
          )
        )
          continue;
        throw error;
      }
    }
    fail(503, "编号分配繁忙，请稍后再试。");
  }
  if (path === "/api/identity/logout") {
    const token = readCookie(request);
    await env.DB.prepare("DELETE FROM identity_sessions WHERE token_hash=?")
      .bind(token ? await digest("session", token) : "")
      .run();
    const r = json({ message: "已退出。" });
    r.headers.set("Set-Cookie", cookie("", 0));
    return r;
  }
  const row = await visitor(request, env, true);
  if (path === "/api/identity/avatar") {
    if (!avatars.has(data.avatar)) fail(400, "请选择列表中的头像。");
    await limit(env, "avatar:" + row.id, 20, 3600);
    const revision = number(data.expected_revision);
    const r = await env.DB.prepare(
      "UPDATE identities SET avatar=?,revision=revision+1 WHERE id=? AND revision=? AND state='active'",
    )
      .bind(data.avatar, row.id, revision)
      .run();
    if (!r.meta.changes) fail(409, "身份已更新，请刷新后再选择头像。");
    return json({
      message: "头像已更新，历史留言也会显示新头像。",
      identity: publicIdentity({
        ...row,
        avatar: data.avatar,
        revision: row.revision + 1,
      }),
    });
  }
  if (path === "/api/identity/rename") {
    await limit(env, "rename:" + row.id, 10, 3600);
    const name = nickname(data.nickname),
      t = now();
    availableName(name, row.public_id === "00000000");
    if (row.nickname_changed_at + 7 * DAY > t)
      fail(409, "领取或上次改名后需满 7 天才能更改昵称。");
    if (name.key === row.nickname_key) fail(400, "新昵称与当前昵称相同。");
    try {
      const r = await env.DB.batch([
        env.DB.prepare(
          "UPDATE identities SET nickname=?,nickname_key=?,nickname_changed_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='active' AND nickname_changed_at<=?",
        ).bind(name.display, name.key, t, row.id, row.revision, t - 7 * DAY),
        env.DB.prepare(
          "INSERT INTO identity_log(identity_id,actor,action,detail,created_at) SELECT ?,?,'rename',?,? WHERE changes()=1",
        ).bind(
          row.id,
          "user:" + row.public_id,
          JSON.stringify({ before: row.nickname, after: name.display }),
          t,
        ),
      ]);
      if (!r[0].meta.changes) fail(409, "身份已更新，请刷新后重试。");
    } catch (error) {
      if (
        String(error).includes(
          "UNIQUE constraint failed: identities.nickname_key",
        )
      )
        fail(409, "这个昵称已经被使用，请换一个。");
      throw error;
    }
    return json({
      message: "昵称已更新；历史留言保留发言时的昵称。",
      identity: publicIdentity({
        ...row,
        nickname: name.display,
        nickname_changed_at: t,
        revision: row.revision + 1,
      }),
    });
  }
  if (path === "/api/identity/rotate") {
    await limit(env, "rotate:" + row.id, 5, 3600);
    if (data.confirm !== true)
      fail(400, "请确认旧恢复码和其他设备登录将失效。");
    const code = secret(),
      hash = await digest("recovery", code),
      t = now();
    const r = await env.DB.batch([
      env.DB.prepare(
        "UPDATE identities SET recovery_hash=?,credential_version=credential_version+1,revision=revision+1 WHERE id=? AND revision=? AND state='active'",
      ).bind(hash, row.id, row.revision),
      env.DB.prepare(
        "UPDATE identity_sessions SET credential_version=credential_version+1 WHERE token_hash=? AND changes()=1",
      ).bind(row.session_hash),
      env.DB.prepare(
        "INSERT INTO identity_log(identity_id,actor,action,detail,created_at) SELECT ?,?,'rotate','',? WHERE changes()=1",
      ).bind(row.id, "user:" + row.public_id, t),
    ]);
    if (!r[0].meta.changes) fail(409, "身份已更新，请刷新后重试。");
    // Keep the current session usable if the response is interrupted; all other sessions expire.
    return json({
      message: "恢复码已重置，旧码及其他设备登录已失效。请保存新码。",
      identity: publicIdentity({ ...row, revision: row.revision + 1 }),
      recovery_code: code.match(/.{8}/g).join("-"),
    });
  }
  fail(404, "页面不存在。");
}
export async function identityAdmin(request, env, url, email) {
  if (url.pathname === "/api/admin/identities" && request.method === "GET") {
    const q = text(url.searchParams.get("q") || "", 0, 100, "关键词"),
      before = number(url.searchParams.get("before"), Number.MAX_SAFE_INTEGER),
      state = url.searchParams.get("state") || "";
    if (state && !["active", "banned"].includes(state)) fail(400, "状态无效。");
    const { results } = await env.DB.prepare(
      `SELECT i.id,i.public_id,i.nickname,i.avatar,i.state,i.created_at,i.nickname_changed_at,i.revision,
    (SELECT COUNT(*) FROM entries e WHERE e.author_id=i.id AND e.deleted_at IS NULL) AS entries,
    (SELECT COUNT(*) FROM identity_sessions s WHERE s.identity_id=i.id AND s.expires_at>? AND s.credential_version=i.credential_version) AS sessions
    FROM identities i WHERE i.id<? AND (?='' OR i.state=?) AND (?='' OR instr(i.public_id,?)>0 OR instr(lower(i.nickname),lower(?))>0) ORDER BY i.id DESC LIMIT 21`,
    )
      .bind(now(), before, state, state, q, q, q)
      .all();
    return json({
      items: results.slice(0, 20),
      next: results.length > 20 ? results[19].id : null,
    });
  }
  const match = url.pathname.match(/^\/api\/admin\/identities\/(\d{8})$/);
  if (match && request.method === "POST") {
    const data = await body(request),
      revision = number(data.expected_revision),
      reason = text(data.reason, 5, 500, "处理依据");
    const row = await env.DB.prepare(
      "SELECT * FROM identities WHERE public_id=?",
    )
      .bind(match[1])
      .first();
    if (!row || row.revision !== revision)
      fail(409, "身份已更新，请刷新重试。");
    let sql,
      args,
      action = data.action;
    if (action === "ban" || action === "unban") {
      sql =
        "UPDATE identities SET state=?,credential_version=credential_version+1,revision=revision+1 WHERE id=? AND revision=?";
      args = [action === "ban" ? "banned" : "active", row.id, revision];
    } else if (action === "revoke") {
      sql =
        "UPDATE identities SET credential_version=credential_version+1,revision=revision+1 WHERE id=? AND revision=?";
      args = [row.id, revision];
    } else fail(400, "操作无效。");
    const r = await env.DB.batch([
      env.DB.prepare(sql).bind(...args),
      env.DB.prepare(
        "INSERT INTO identity_log(identity_id,actor,action,detail,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
      ).bind(row.id, email, action, reason, now()),
    ]);
    if (!r[0].meta.changes) fail(409, "身份已更新，请刷新重试。");
    return json({ message: "已保存，相关登录已失效。" });
  }
  fail(404, "页面不存在。");
}
export async function cleanupIdentities(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM identity_limits WHERE expires_at<?").bind(t),
    env.DB.prepare(
      "DELETE FROM identity_sessions WHERE expires_at<? OR credential_version!=(SELECT credential_version FROM identities WHERE id=identity_id)",
    ).bind(t),
    env.DB.prepare("DELETE FROM identity_claims WHERE created_at<?").bind(
      t - 2 * DAY,
    ),
  ]);
}
