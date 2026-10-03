(() => {
  const root = document.querySelector("[data-cookie-center]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const returnLink = $("[data-cookie-return]");
  const rawReturn = new URLSearchParams(location.search).get("return");
  if (
    rawReturn &&
    rawReturn.startsWith("/") &&
    !rawReturn.startsWith("//") &&
    !/[\\\x00-\x1f]/.test(rawReturn)
  ) {
    const url = new URL(rawReturn, location.origin);
    if (url.origin === location.origin && url.pathname !== location.pathname) {
      returnLink.href = url.pathname + url.search + url.hash;
      returnLink.textContent = "返回刚才的页面";
    }
  }
  returnLink.addEventListener("click", (event) => {
    if (!$("[data-cookie-backup]").hidden) {
      event.preventDefault();
      $("[data-cookie-status]").textContent =
        "请先保存编号和恢复码，再返回原页面。";
      $("[data-cookie-backup]").scrollIntoView({ block: "nearest" });
    }
  });
  let base;
  try {
    const url = new URL(root.dataset.api);
    if (
      root.dataset.enabled !== "true" ||
      url.protocol !== "https:" ||
      url.search ||
      url.hash ||
      !root.dataset.siteKey
    )
      throw Error();
    base = url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    $("[data-cookie-panel]").hidden = false;
    $("[data-cookie-status]").textContent = "饼干服务暂未开放，请稍后再来。";
    return;
  }
  const area = $("[data-cookie-activity]");
  const list = $("[data-cookie-entries]");
  const status = $("[data-cookie-activity-status]");
  const view = $("[data-cookie-view]");
  const state = $("[data-cookie-state]");
  const more = $("[data-cookie-more]");
  const controls = [view, state, more, $("[data-cookie-reload]")];
  const sources = new Map(
    [...root.querySelectorAll("[data-source-scope]")].map((a) => [
      a.dataset.sourceScope,
      { title: a.textContent, url: a.getAttribute("href") },
    ]),
  );
  const labels = {
    pending: "待审核",
    approved: "已通过",
    rejected: "未通过",
    hidden: "已收起",
  };
  const categories = {
    article: "文章评论",
    game: "游戏评论",
    feedback: "问题建议",
    find: "寻找游戏",
    chat: "闲聊交流",
  };
  let userId = null,
    cursor = null,
    generation = 0,
    controller = null,
    loaded = false;
  function el(tag, text, cls = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  }
  function card(item) {
    const node = el("article", "", "community-card cookie-entry");
    const source = sources.get(item.scope);
    const publicThread = !!item.is_public;
    const meta = el("div", "", "community-card-meta");
    meta.append(
      el(
        "span",
        item.status === "approved" && !publicThread
          ? "讨论已收起"
          : labels[item.status],
        "community-badge",
      ),
      el(
        "span",
        `${categories[item.category] || "讨论"} · ${item.parent_id ? "回复" : "主帖"}`,
        "community-meta",
      ),
      el(
        "time",
        new Date(item.created_at).toLocaleString("zh-CN"),
        "community-meta",
      ),
    );
    node.append(
      meta,
      el("h3", item.title || source?.title || "原内容已下架"),
      el("p", item.body, "community-card-body"),
    );
    if (source) {
      const url = new URL(source.url, location.origin);
      if (publicThread)
        url.searchParams.set("discussion", String(item.parent_id || item.id));
      url.hash = "comments";
      const link = el(
        "a",
        publicThread ? "查看讨论与回复" : "返回原页面",
        "button",
      );
      link.href = url.pathname + url.search + url.hash;
      node.append(link);
    }
    return node;
  }
  async function load(reset = true) {
    if (!userId) return;
    const ticket = ++generation;
    controller?.abort();
    const requestController = (controller = new AbortController());
    const timeout = setTimeout(() => requestController.abort(), 15000);
    const owner = userId;
    if (reset) {
      list.replaceChildren();
      cursor = null;
    }
    controls.forEach((control) => (control.disabled = true));
    $("[data-cookie-state-label]").hidden = view.value === "participated";
    status.textContent = "正在读取你的交流记录…";
    try {
      const params = new URLSearchParams({
        view: view.value,
        status: view.value === "mine" ? state.value : "all",
      });
      if (!reset && cursor) params.set("before", cursor);
      const response = await fetch(base + "/api/identity/entries?" + params, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (ticket !== generation || owner !== userId) return;
      if (!response.ok) throw Error(data.error || "暂时无法读取记录");
      if (!Array.isArray(data.items))
        throw Error("饼干服务暂未开放，请刷新身份状态。");
      data.items.forEach((item) => list.append(card(item)));
      cursor = data.next;
      more.hidden = !cursor;
      loaded = true;
      status.textContent = list.children.length
        ? "仅你自己能看到此处的个人记录。"
        : view.value === "mine"
          ? "这个分类下还没有留言。去喜欢的文章或游戏聊聊吧。"
          : "还没有参与的公开讨论。留言通过审核后会出现在这里。";
    } catch (error) {
      if (ticket !== generation) return;
      status.textContent =
        error.name === "AbortError"
          ? "读取超时，请点击刷新重试。"
          : error.message;
      if (reset) more.hidden = true;
    } finally {
      clearTimeout(timeout);
      if (ticket === generation)
        controls.forEach((control) => (control.disabled = false));
    }
  }
  function clear() {
    generation++;
    controller?.abort();
    list.replaceChildren();
    cursor = null;
    loaded = false;
    more.hidden = true;
    area.hidden = true;
    controls.forEach((control) => (control.disabled = false));
  }
  view.addEventListener("change", () => load());
  state.addEventListener("change", () => load());
  $("[data-cookie-reload]").addEventListener("click", () => load());
  more.addEventListener("click", () => load(false));
  window.addEventListener("pagehide", clear);
  window.WCIdentity(
    root,
    base,
    () => window.WCLoadTurnstile(),
    (profile) => {
      const next = profile?.state === "active" ? profile.public_id : null;
      if (next !== userId) {
        clear();
        userId = next;
      }
      area.hidden = !next;
      if (next && !loaded) load();
    },
  );
})();
