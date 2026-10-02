(() => {
  const $ = (s) => document.querySelector(s);
  const entries = $("#entries"),
    status = $("#status"),
    more = $("#more");
  const filters = ["filter", "category", "kind", "progress", "query", "author"];
  const labels = {
    game: "游戏评论区",
    feedback: "问题建议",
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
  function select(options, value) {
    const e = el("select");
    for (const [key, label] of options) {
      const o = el("option", label);
      o.value = key;
      e.append(o);
    }
    e.value = value;
    return e;
  }
  function field(label, input) {
    const l = el("label", label);
    l.append(input);
    return l;
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
        `#${item.id} · ${item.scope} · ${labels[item.category]} · ${labels[item.status]} · ${new Date(item.created_at).toLocaleString("zh-CN")}`,
        "meta",
      ),
    );
    article.append(
      el(
        "h2",
        item.title || `${item.nickname} 的${item.parent_id ? "回复" : "评论"}`,
      ),
    );
    article.append(
      el(
        "p",
        `昵称：${item.nickname} · ${item.author_code ? "饼干 #" + item.author_code : "旧版访客"}`,
        "meta",
      ),
    );
    if (item.parent_id)
      article.append(
        el(
          "blockquote",
          `回复 #${item.parent_id}（${labels[item.parent_status]}）\n${item.parent_title || ""}\n${item.parent_body || ""}`,
        ),
      );
    article.append(el("p", item.body, "body"));
    const progress = select(
      [
        ["open", "待处理 / 寻找中"],
        ["working", "处理中 / 有线索"],
        ["done", "已解决 / 已找到"],
      ],
      item.progress,
    );
    const note = el("input");
    note.maxLength = 300;
    note.placeholder = "可选，仅后台可见";
    article.append(field("处理进度", progress), field("操作备注", note));
    const actions = el("div", null, "actions"),
      result = el("p");
    result.setAttribute("role", "status");
    let saving = false;
    async function save(data) {
      if (saving) return;
      saving = true;
      const controls = [
        ...article.querySelectorAll("input,textarea,select,button"),
      ];
      controls.forEach((e) => (e.disabled = true));
      result.textContent = "正在保存…";
      try {
        const response = await api(`/api/admin/entries/${item.id}`, {
          ...data,
          expected_revision: item.revision,
          reason: note.value,
        });
        article.remove();
        await load(true);
        status.textContent = response.message + " 公开页面刷新后生效。";
      } catch (error) {
        result.textContent =
          error.message + " 如网络中断，请先刷新确认操作结果。";
        controls.forEach((e) => (e.disabled = false));
      } finally {
        saving = false;
      }
    }
    for (const [target, label] of [
      ["approved", "通过并公开"],
      ["rejected", "拒绝"],
      ["hidden", "隐藏"],
      [item.status, "仅保存进度"],
    ]) {
      if (target === item.status && label !== "仅保存进度") continue;
      const button = el("button", label);
      button.type = "button";
      button.addEventListener("click", () =>
        save({
          action: "moderate",
          status: target,
          progress: progress.value,
          expected_status: item.status,
          expected_progress: item.progress,
        }),
      );
      actions.append(button);
    }
    const editor = el("form", null, "editor");
    editor.hidden = true;
    const nickname = el("input");
    nickname.value = item.nickname;
    nickname.readOnly = !!item.author_id;
    nickname.maxLength = 32;
    nickname.required = true;
    const title = el("input");
    title.value = item.title;
    title.minLength = 2;
    title.maxLength = 80;
    title.required = true;
    const body = el("textarea");
    body.value = item.body;
    body.minLength = 2;
    body.maxLength = 2000;
    body.rows = 6;
    body.required = true;
    const category = select(
      [
        ["feedback", "问题建议"],
        ["find", "寻找游戏"],
        ["chat", "闲聊交流"],
      ],
      item.category,
    );
    editor.append(field("昵称", nickname));
    if (item.scope === "board" && !item.parent_id)
      editor.append(
        field("标题", title),
        field("分类（回复同步调整）", category),
      );
    editor.append(
      field("内容", body),
      el("p", "保存不会改变审核状态；已公开留言的修改会立即生效。", "meta"),
    );
    const submit = el("button", "保存编辑");
    submit.type = "submit";
    const cancel = el("button", "取消编辑");
    cancel.type = "button";
    cancel.addEventListener("click", () => (editor.hidden = true));
    editor.append(submit, cancel);
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      save({
        action: "edit",
        nickname: nickname.value,
        title: title.value,
        body: body.value,
        category: category.value,
      });
    });
    const edit = el("button", "编辑");
    edit.type = "button";
    edit.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      if (!editor.hidden) nickname.focus();
    });
    const remove = el("button", "删除", "danger");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const description = item.parent_id ? "这条回复" : "这条留言及其所有回复";
      if (
        window.confirm(
          `确认删除${description}（#${item.id}）？\n将从公开页面和审核队列移除，保留后台审计记录。此操作无法在后台撤销。`,
        )
      )
        save({ action: "delete" });
    });
    actions.append(edit, remove);
    article.append(actions, editor, result);
    return article;
  }
  async function load(reset) {
    if (busy) return;
    busy = true;
    const controls = filters
      .map((id) => $("#" + id))
      .concat([more, $("#refresh")]);
    controls.forEach((e) => (e.disabled = true));
    status.textContent = "正在读取审核队列…";
    try {
      const params = new URLSearchParams({ status: $("#filter").value });
      for (const [id, key] of [
        ["category", "category"],
        ["kind", "kind"],
        ["progress", "progress"],
        ["query", "q"],
        ["author", "author"],
      ]) {
        const value = $("#" + id).value.trim();
        if (value) params.set(key, value);
      }
      if (!reset && cursor) params.set("before", cursor);
      const data = await api("/api/admin/entries?" + params);
      if (reset) entries.replaceChildren();
      data.items.forEach((item) => entries.append(card(item)));
      cursor = data.next;
      more.hidden = !cursor;
      $("#identity").textContent = `当前管理员：${data.moderator}`;
      status.textContent = entries.children.length
        ? "已加载符合筛选条件的留言。"
        : "当前筛选条件下没有留言。";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      controls.forEach((e) => (e.disabled = false));
    }
  }
  for (const id of ["filter", "category", "kind", "progress"])
    $("#" + id).addEventListener("change", () => load(true));
  $("#search").addEventListener("submit", (event) => {
    event.preventDefault();
    load(true);
  });
  more.addEventListener("click", () => load(false));
  load(true);
})();
