(() => {
  "use strict";
  const root = document.querySelector("[data-guestbook]");
  if (!root) return;
  const find = (name) => root.querySelector(`[data-guestbook-${name}]`);
  const status = find("status"),
    entries = find("entries"),
    refresh = find("refresh");
  const previous = find("previous"),
    next = find("next"),
    pagination = find("pagination");
  const repository = root.dataset.repository;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "")) {
    status.textContent = "留言板仓库配置有误，请通过 GitHub 联系站长。";
    return;
  }
  const api = `https://api.github.com/repos/${repository}/issues`;
  const github = `https://github.com/${repository}/issues`;
  const perPage = 20;
  let currentPage = 1,
    hasNext = false,
    busy = false,
    loaded = false;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const link = (text, url) => {
    const element = node("a", "guestbook-link", text);
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
    return element;
  };
  const date = (value) => {
    const time = node("time");
    const parsed = new Date(value);
    if (value && !Number.isNaN(parsed.getTime())) {
      time.dateTime = parsed.toISOString();
      time.textContent = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(parsed);
    } else time.textContent = "日期未知";
    return time;
  };
  const author = (user) =>
    user?.login
      ? link(
          `@${user.login}`,
          `https://github.com/${encodeURIComponent(user.login)}`,
        )
      : node("span", "", "已删除的用户");
  const errorText = (error) =>
    error.name === "AbortError"
      ? "连接 GitHub 超时，请稍后重试，或在 GitHub 查看。"
      : error.userMessage ||
        "暂时无法连接 GitHub，请检查网络后重试，或在 GitHub 查看。";
  const request = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        // Request GitHub's plain-text Markdown representation; never insert remote HTML.
        headers: { Accept: "application/vnd.github.text+json" },
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`GitHub HTTP ${response.status}`);
        if (response.status === 403 || response.status === 429) {
          error.userMessage =
            "GitHub 暂时限制了访问，请稍后重试，或在 GitHub 查看。";
          const reset =
            Number(response.headers.get("x-ratelimit-reset")) * 1000;
          if (
            response.headers.get("x-ratelimit-remaining") === "0" &&
            reset > Date.now()
          )
            error.userMessage += ` 预计 ${new Date(reset).toLocaleTimeString("zh-CN")} 后恢复。`;
        } else if (response.status === 404 || response.status === 410) {
          error.userMessage =
            "留言暂不可访问，可能已删除或仓库设置已变更。请在 GitHub 查看。";
        } else
          error.userMessage =
            "GitHub 暂时未能返回留言，请稍后重试，或在 GitHub 查看。";
        throw error;
      }
      const items = await response.json();
      if (
        !Array.isArray(items) ||
        items.some((item) => !item || typeof item !== "object")
      )
        throw new Error("Invalid GitHub response");
      const pages = response.headers.get("link");
      return {
        items,
        more: pages ? /rel="next"/.test(pages) : items.length === perPage,
      };
    } finally {
      clearTimeout(timer);
    }
  };
  const body = (item) =>
    node("p", "guestbook-body", item.body_text ?? item.body ?? "（没有正文）");
  const comments = (issue) => {
    const section = node("div", "guestbook-replies");
    const button = node("button", "button", `查看回复（${issue.comments}）`);
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    const panel = node("div", "guestbook-reply-panel");
    panel.id = `guestbook-replies-${issue.number}`;
    panel.hidden = true;
    button.setAttribute("aria-controls", panel.id);
    const list = node("div", "guestbook-reply-list");
    const state = node("p", "guestbook-status");
    state.setAttribute("role", "status");
    const more = node("button", "button", "加载更多回复");
    more.type = "button";
    more.hidden = true;
    panel.append(list, state, more);
    section.append(button, panel);
    let page = 1,
      initialized = false,
      loading = false;
    const seen = new Set();
    const load = async () => {
      if (loading) return;
      loading = true;
      more.disabled = true;
      panel.setAttribute("aria-busy", "true");
      state.textContent = "正在加载回复…";
      try {
        const result = await request(
          `${api}/${issue.number}/comments?per_page=${perPage}&page=${page}`,
        );
        for (const reply of result.items) {
          if (!Number.isSafeInteger(reply.id) || seen.has(reply.id)) continue;
          seen.add(reply.id);
          const entry = node("article", "guestbook-reply");
          const meta = node("div", "guestbook-meta");
          meta.append(
            author(reply.user),
            date(reply.created_at),
            link(
              "查看原回复 ↗",
              `${github}/${issue.number}#issuecomment-${reply.id}`,
            ),
          );
          entry.append(meta, body(reply));
          list.append(entry);
        }
        initialized = true;
        page++;
        state.textContent = seen.size
          ? `已显示 ${seen.size} 条回复。`
          : "暂时没有可显示的回复。";
        more.hidden = !result.more;
        more.textContent = "加载更多回复";
      } catch (error) {
        state.textContent = errorText(error);
        more.hidden = false;
        more.textContent = "重试加载回复";
      } finally {
        loading = false;
        more.disabled = false;
        panel.setAttribute("aria-busy", "false");
      }
    };
    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden && !initialized) load();
    });
    more.addEventListener("click", load);
    return section;
  };
  const render = (issue) => {
    const card = node("article", "guestbook-entry");
    const heading = node("h3");
    heading.append(
      link(issue.title || "无标题留言", `${github}/${issue.number}`),
    );
    const meta = node("div", "guestbook-meta");
    meta.append(
      author(issue.user),
      date(issue.created_at),
      node("span", "", `#${issue.number}`),
      node(
        "span",
        "guestbook-state",
        issue.state === "closed" ? "已关闭" : "开放中",
      ),
    );
    const actions = node("div", "guestbook-entry-actions");
    actions.append(
      link("在 GitHub 回复 ↗", `${github}/${issue.number}#new_comment_field`),
    );
    if (issue.locked)
      actions.append(
        node("span", "", "此留言已锁定，回复权限以 GitHub 为准。"),
      );
    card.append(heading, meta, body(issue), actions);
    if (issue.comments > 0) card.append(comments(issue));
    return card;
  };
  const controls = () => {
    refresh.disabled = busy;
    previous.disabled = busy || currentPage === 1;
    next.disabled = busy || !hasNext;
    pagination.hidden = !loaded || (currentPage === 1 && !hasNext);
    find("page").textContent = `第 ${currentPage} 页`;
    entries.setAttribute("aria-busy", String(busy));
  };
  const load = async (page) => {
    if (busy) return;
    busy = true;
    controls();
    status.textContent = "正在加载 GitHub 留言…";
    try {
      const result = await request(
        `${api}?state=all&sort=created&direction=desc&per_page=${perPage}&page=${page}`,
      );
      const issues = result.items.filter(
        (item) =>
          !item.pull_request &&
          Number.isSafeInteger(item.number) &&
          item.number > 0,
      );
      entries.replaceChildren(...issues.map(render));
      currentPage = page;
      hasNext = result.more;
      loaded = true;
      status.textContent = issues.length
        ? `本页 ${issues.length} 条留言 · 已从 GitHub 更新`
        : currentPage === 1 && !hasNext
          ? "还没有留言，来写下第一段游戏回忆吧。"
          : "本页没有留言（已略过代码合并请求），可以切换其他页查看。";
      refresh.textContent = "刷新留言";
    } catch (error) {
      status.textContent =
        errorText(error) + (loaded ? " 下方保留上次成功加载的内容。" : "");
      refresh.textContent = "重试 / 刷新留言";
    } finally {
      busy = false;
      controls();
    }
  };
  refresh.hidden = false;
  refresh.addEventListener("click", () => load(1));
  previous.addEventListener("click", () => load(currentPage - 1));
  next.addEventListener("click", () => load(currentPage + 1));
  load(1);
})();
