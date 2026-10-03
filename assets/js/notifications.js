(() => {
  const nav = document.querySelector("[data-notification-nav]");
  if (!nav || nav.dataset.enabled !== "true") return;
  let base;
  try {
    const url = new URL(nav.dataset.api);
    if (url.protocol !== "https:" || url.search || url.hash) return;
    base = url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return;
  }
  const root = document.querySelector("[data-cookie-center]");
  const area = root?.querySelector("[data-notifications]");
  const $ = (s) => area?.querySelector(s);
  const list = $("[data-notification-list]");
  const status = $("[data-notification-status]");
  const filter = $("[data-notification-filter]");
  const more = $("[data-notification-more]");
  const readAll = $("[data-notification-read-all]");
  const sources = new Map(
    [...document.querySelectorAll("[data-source-scope]")].map((a) => [
      a.dataset.sourceScope,
      { title: a.textContent, url: a.getAttribute("href") },
    ]),
  );
  let owner = null,
    generation = 0,
    controller,
    cursor = null,
    through = 0,
    unread = 0,
    lastCheck = 0,
    loaded = false;
  const labels = {
    approved: "你的留言已通过审核",
    rejected: "你的留言未通过审核",
    hidden: "你的留言已被收起",
    pending: "你的留言已重新进入审核",
  };
  function badge(count) {
    unread = count;
    const node = nav.querySelector("[data-notification-badge]");
    node.hidden = !count;
    node.textContent = count > 99 ? "99+" : String(count);
    nav.setAttribute(
      "aria-label",
      count ? `我的饼干，${count} 条未读通知` : "我的饼干",
    );
    const dot = document.querySelector("[data-notification-mobile]");
    if (dot) dot.hidden = !count;
    if (readAll) readAll.disabled = !count;
  }
  function clear() {
    generation++;
    controller?.abort();
    list?.replaceChildren();
    if (area) area.hidden = true;
    if (more) more.hidden = true;
    cursor = null;
    through = 0;
    loaded = false;
    badge(0);
  }
  function element(tag, text, cls = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = cls;
    return node;
  }
  async function api(path, data, signal) {
    const response = await fetch(base + "/api/identity/notifications" + path, {
      credentials: "include",
      cache: "no-store",
      signal,
      ...(data
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(Error(result.error || "通知暂时无法读取，请重试。"), {
        status: response.status,
      });
    if (typeof result.owner !== "string") throw Error("通知服务暂未开放。");
    return result;
  }
  function card(item) {
    const node = element("article", "", "community-card cookie-notification");
    node.dataset.unread = String(!item.read_at);
    const meta = element("div", "", "community-card-meta");
    meta.append(
      element("span", item.read_at ? "已读" : "未读", "community-badge"),
      element(
        "time",
        new Date(item.created_at).toLocaleString("zh-CN"),
        "community-meta",
      ),
    );
    node.append(
      meta,
      element(
        "h3",
        item.kind === "reply"
          ? `${item.nickname} 回复了你的主帖`
          : labels[item.outcome] || "审核状态更新",
      ),
    );
    const source = sources.get(item.scope);
    node.append(
      element("p", source?.title || "原页面已下架", "community-meta"),
      element("p", item.excerpt, "community-card-body"),
    );
    const actions = element("div", "", "cookie-notification-actions");
    if (source && item.is_public) {
      const url = new URL(source.url, location.origin);
      url.searchParams.set(
        "discussion",
        String(item.parent_id || item.entry_id),
      );
      url.hash = "comments";
      const link = element("a", "查看讨论", "button");
      link.href = url.pathname + url.search + url.hash;
      actions.append(link);
    }
    if (!item.read_at) {
      const button = element("button", "标为已读", "button");
      button.type = "button";
      button.addEventListener("click", () => mark({ id: item.id }, button));
      actions.append(button);
    }
    node.append(actions);
    return node;
  }
  async function load(reset = true) {
    if (area && !owner) return;
    const ticket = ++generation,
      expectedOwner = owner;
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const timer = setTimeout(() => activeController.abort(), 15000);
    const signal = controller.signal;
    lastCheck = Date.now();
    if (area) {
      area.hidden = false;
      if (reset) {
        list.replaceChildren();
        cursor = null;
        through = 0;
      }
      status.textContent = "正在读取通知…";
      area
        .querySelectorAll("button,select")
        .forEach((n) => (n.disabled = true));
    }
    try {
      const params = new URLSearchParams({ filter: filter?.value || "all" });
      if (!reset && cursor) params.set("before", cursor);
      const data = await api(area ? "?" + params : "/unread", null, signal);
      if (ticket !== generation) return;
      if (area && data.owner !== expectedOwner) {
        clear();
        return;
      }
      badge(data.unread);
      if (area) {
        if (!Array.isArray(data.items)) throw Error("通知服务暂未开放。");
        data.items.forEach((item) => list.append(card(item)));
        cursor = data.next;
        through = Math.max(through, data.through);
        loaded = true;
        more.hidden = !cursor;
        status.textContent = list.children.length
          ? `${data.unread} 条未读通知。点击“标为已读”可消除提醒。`
          : "暂时没有通知。新的回复与审核结果会出现在这里。";
      }
    } catch (error) {
      if (ticket !== generation) return;
      if (error.status === 401 || error.status === 403) {
        clear();
        return;
      }
      badge(0);
      if (status)
        status.textContent =
          error.name === "AbortError"
            ? "读取超时，请刷新通知重试。"
            : error.message;
    } finally {
      clearTimeout(timer);
      if (ticket === generation && area) {
        area
          .querySelectorAll("button,select")
          .forEach((n) => (n.disabled = false));
        readAll.disabled = !unread || !through;
      }
    }
  }
  async function mark(data, button) {
    const expectedOwner = owner,
      ticket = generation;
    button.disabled = true;
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 15000);
    try {
      const result = await api(
        "/read",
        { ...data, owner: expectedOwner },
        abort.signal,
      );
      if (owner !== expectedOwner || ticket !== generation) return;
      if (result.owner !== owner) {
        clear();
        return;
      }
      try {
        localStorage.setItem("wc-notifications-changed", String(Date.now()));
      } catch {}
      await load();
    } catch (error) {
      if (owner !== expectedOwner || ticket !== generation) return;
      if (error.status === 401 || error.status === 403) clear();
      else
        status.textContent =
          error.name === "AbortError" ? "操作超时，请重试。" : error.message;
    } finally {
      clearTimeout(timer);
      button.disabled = false;
    }
  }
  if (area) {
    root.addEventListener("community-identity-changed", (event) => {
      const next = event.detail.public_id || null;
      if (next !== owner) {
        clear();
        owner = next;
      }
      if (owner && !loaded) load();
    });
    filter.addEventListener("change", () => load());
    $("[data-notification-refresh]").addEventListener("click", () => load());
    more.addEventListener("click", () => load(false));
    readAll.addEventListener("click", () => {
      if (through) mark({ through }, readAll);
    });
  } else load();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastCheck > 60000) load();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "wc-notifications-changed") load();
    if (event.key === "wc-cookie-changed") {
      clear();
      if (!area) load();
    }
  });
  window.addEventListener("pagehide", clear);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) load();
  });
})();
