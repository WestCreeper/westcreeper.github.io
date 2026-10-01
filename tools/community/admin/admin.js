(() => {
  const entries = document.querySelector("#entries"),
    status = document.querySelector("#status");
  const more = document.querySelector("#more"),
    filter = document.querySelector("#filter");
  const labels = {
    game: "游戏评论",
    feedback: "意见反馈",
    find: "寻找游戏",
    chat: "闲聊交流",
    pending: "待审核",
    approved: "已公开",
    rejected: "已拒绝",
    hidden: "已隐藏",
  };
  let cursor = null,
    busy = false;
  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }
  async function api(path, data) {
    const r = await fetch(path, {
      method: data ? "POST" : "GET",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const value = await r
      .json()
      .catch(() => ({ error: "登录可能已过期，请刷新页面重新登录。" }));
    if (!r.ok) throw new Error(value.error || "请求失败");
    return value;
  }
  function card(item) {
    const article = el("article");
    article.append(
      el(
        "p",
        `#${item.id} · ${item.scope} · ${labels[item.category]} · ${new Date(item.created_at).toLocaleString("zh-CN")}`,
        "meta",
      ),
    );
    article.append(
      el(
        "h2",
        item.title || `${item.nickname} 的${item.parent_id ? "回复" : "评论"}`,
      ),
    );
    article.append(el("p", `昵称：${item.nickname}`, "meta"));
    if (item.parent_id)
      article.append(
        el(
          "blockquote",
          `回复 #${item.parent_id}（${labels[item.parent_status]}）\n${item.parent_title || ""}\n${item.parent_body || ""}`,
        ),
      );
    article.append(el("p", item.body, "body"));
    const progress = el("select");
    for (const [value, label] of [
      ["open", "待处理 / 寻找中"],
      ["working", "处理中 / 有线索"],
      ["done", "已解决 / 已找到"],
    ]) {
      const option = el("option", label);
      option.value = value;
      progress.append(option);
    }
    progress.value = item.progress;
    const pl = el("label", "处理进度 ");
    pl.append(progress);
    article.append(pl);
    const note = el("input");
    note.maxLength = 300;
    note.placeholder = "可选，仅后台可见";
    const nl = el("label", "审核备注 ");
    nl.append(note);
    article.append(nl);
    const actions = el("div", null, "actions"),
      result = el("p");
    result.setAttribute("role", "status");
    for (const [target, label] of [
      ["approved", "通过并公开"],
      ["rejected", "拒绝"],
      ["hidden", "隐藏"],
      [item.status, "仅保存进度"],
    ]) {
      if (target === item.status && label !== "仅保存进度") continue;
      const button = el("button", label);
      button.addEventListener("click", async () => {
        const buttons = [...actions.querySelectorAll("button")];
        buttons.forEach((b) => (b.disabled = true));
        try {
          await api(`/api/admin/entries/${item.id}`, {
            status: target,
            progress: progress.value,
            expected_status: item.status,
            expected_progress: item.progress,
            reason: note.value,
          });
          item.status = target;
          item.progress = progress.value;
          if (target !== filter.value) article.remove();
          else {
            const updated = card(item);
            article.replaceWith(updated);
          }
          status.textContent = "审核结果已保存。公开页面刷新后生效。";
        } catch (error) {
          result.textContent = error.message;
          buttons.forEach((b) => (b.disabled = false));
        }
      });
      actions.append(button);
    }
    article.append(actions, result);
    return article;
  }
  async function load(reset) {
    if (busy) return;
    busy = true;
    filter.disabled = true;
    more.disabled = true;
    document.querySelector("#refresh").disabled = true;
    status.textContent = "正在读取审核队列…";
    try {
      const data = await api(
        `/api/admin/entries?status=${filter.value}${!reset && cursor ? `&before=${cursor}` : ""}`,
      );
      if (reset) entries.replaceChildren();
      data.items.forEach((item) => entries.append(card(item)));
      cursor = data.next;
      more.hidden = !cursor;
      document.querySelector("#identity").textContent =
        `当前管理员：${data.moderator}`;
      status.textContent = entries.children.length
        ? "已加载审核队列。"
        : "这个队列暂时没有内容。";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      filter.disabled = false;
      more.disabled = false;
      document.querySelector("#refresh").disabled = false;
    }
  }
  filter.addEventListener("change", () => load(true));
  document
    .querySelector("#refresh")
    .addEventListener("click", () => load(true));
  more.addEventListener("click", () => load(false));
  load(true);
})();
