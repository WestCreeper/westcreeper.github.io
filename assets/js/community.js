(() => {
  let turnstilePromise;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!turnstilePromise)
      turnstilePromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timer = setTimeout(() => {
          script.remove();
          turnstilePromise = null;
          reject(new Error("人机验证加载超时，请关闭表单后重试。"));
        }, 15000);
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = () => {
          clearTimeout(timer);
          if (window.turnstile) resolve(window.turnstile);
          else {
            turnstilePromise = null;
            reject(new Error("人机验证暂不可用。"));
          }
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          turnstilePromise = null;
          reject(new Error("无法加载人机验证，请检查网络后重新打开表单。"));
        };
        document.head.append(script);
      });
    return turnstilePromise;
  }
  function el(tag, value, cls) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (cls) node.className = cls;
    return node;
  }
  for (const root of document.querySelectorAll("[data-community]")) {
    const find = (s) => root.querySelector(s),
      status = find("[data-community-status]");
    const loadButton = find("[data-community-load]"),
      writeButton = find("[data-community-write]"),
      more = find("[data-community-more]");
    const entries = find("[data-community-entries]"),
      filter = find("[data-community-category]");
    const form = find("[data-community-form]"),
      formStatus = find("[data-community-form-status]");
    let apiURL;
    try {
      apiURL = new URL(root.dataset.api);
      if (apiURL.protocol !== "https:" || apiURL.search || apiURL.hash)
        throw new Error();
    } catch {
      apiURL = null;
    }
    if (root.dataset.enabled !== "true" || !apiURL || !root.dataset.siteKey) {
      loadButton.hidden = true;
      if (filter) filter.disabled = true;
      status.textContent = "讨论区暂未开放，请稍后再来。";
      continue;
    }
    const base = apiURL.origin + apiURL.pathname.replace(/\/$/, "");
    const scope = root.dataset.scope;
    const feed = root.dataset.feed === "all" ? "all" : scope;
    const gameLinks = new Map(
      [...root.querySelectorAll("[data-game-id]")].map((link) => [
        "game:" + link.dataset.gameId,
        { title: link.textContent, url: link.getAttribute("href") },
      ]),
    );
    for (const link of root.querySelectorAll("[data-article-id]")) {
      gameLinks.set("article:" + link.dataset.articleId, {
        title: link.textContent,
        url: link.getAttribute("href"),
        article: true,
      });
    }
    let replyScope = scope;
    let cursor = null,
      reading = false,
      submitting = false,
      parentId = null,
      widget = null,
      mounting = false,
      token = "",
      receipt = false;
    const identity = window.WCIdentity?.(
      root,
      base,
      loadTurnstile,
      (profile) => {
        form.elements.nickname.value = profile?.nickname || "";
        form.elements.nickname.readOnly = true;
      },
    );
    writeButton.hidden = false;
    status.textContent = "点击查看，加载已通过审核的内容。";
    async function api(params, data) {
      const response = await fetch(
        base +
          "/api/entries" +
          (params ? "?" + new URLSearchParams(params) : ""),
        {
          method: data ? "POST" : "GET",
          headers: data ? { "Content-Type": "application/json" } : {},
          body: data ? JSON.stringify(data) : undefined,
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "请求失败，请稍后重试。");
      return result;
    }
    function progressLabel(item) {
      return (
        item.category === "find"
          ? { open: "寻找中", working: "有线索", done: "已找到" }
          : { open: "待处理", working: "处理中", done: "已解决" }
      )[item.progress];
    }
    const avatarSources = new Map(
      [...root.querySelectorAll("[data-cookie-avatar]")].map((b) => [
        b.dataset.cookieAvatar,
        b.querySelector("img").getAttribute("src"),
      ]),
    );
    try {
      for (const id of JSON.parse(root.dataset.avatars || "[]")) {
        if (/^[a-z]+$/.test(id) && root.dataset.avatarBase)
          avatarSources.set(id, root.dataset.avatarBase + id + ".svg");
      }
    } catch {}
    const reactions = window.WCReactions?.(root, base, identity);
    root.addEventListener("community-avatar-changed", (event) => {
      const src = avatarSources.get(event.detail.avatar);
      if (!src) return;
      root.querySelectorAll("[data-author-avatar]").forEach((img) => {
        if (img.dataset.authorAvatar === event.detail.public_id) img.src = src;
      });
    });
    function card(item, isReply = false, topicAuthor = null) {
      const article = el("article", null, "community-card");
      const meta = el("div", null, "community-card-meta");
      const avatar = el("img", null, "community-avatar");
      avatar.src =
        avatarSources.get(item.author_avatar) ||
        avatarSources.get("moss") ||
        "";
      avatar.alt = "";
      avatar.width = 40;
      avatar.height = 40;
      avatar.setAttribute("data-author-avatar", item.author_code || "");
      if (avatar.src) meta.append(avatar);
      meta.append(
        el(
          "strong",
          item.nickname,
          item.author_code === "00000000" ? "community-owner-name" : "",
        ),
        el(
          "time",
          new Date(item.created_at).toLocaleString("zh-CN"),
          "community-meta",
        ),
      );
      if (scope === "board" && !isReply) {
        meta.append(
          el(
            "span",
            {
              game: "游戏评论区",
              article: "文章评论区",
              feedback: "问题建议",
              find: "寻找游戏",
              chat: "闲聊交流",
            }[item.category],
            "community-badge",
          ),
        );
        if (["find", "feedback"].includes(item.category))
          meta.append(el("span", progressLabel(item), "community-badge"));
      }
      meta.append(
        el(
          "span",
          item.author_code
            ? `${!isReply || item.author_code === topicAuthor ? "楼主" : "回复者"} · #${item.author_code}`
            : "旧版访客",
          "community-badge " +
            (item.author_code
              ? !isReply || item.author_code === topicAuthor
                ? "community-id-op"
                : "community-id-reply"
              : ""),
        ),
      );
      article.append(meta);
      const game = gameLinks.get(item.scope);
      if (game && !isReply) {
        const link = el(
          "a",
          (game.article ? "来自文章：" : "来自游戏：") + game.title,
          "community-game-link",
        );
        link.href = game.url;
        article.append(link);
      }
      if (item.title) article.append(el("h3", item.title));
      article.append(el("p", item.body, "community-card-body"));
      if (reactions) article.append(reactions(item));
      if (!isReply) {
        const reply = el("button", "回复", "button");
        reply.type = "button";
        reply.addEventListener("click", () => openForm(item));
        article.append(reply);
        if (item.replies) {
          const details = el("details"),
            summary = el("summary", `查看 ${item.replies} 条回复`),
            list = el("div", null, "community-replies");
          const state = el("p", null, "community-meta"),
            next = el("button", "加载回复", "button");
          next.type = "button";
          let nextCursor = null,
            loaded = false,
            busy = false;
          async function replies() {
            if (busy) return;
            busy = true;
            next.disabled = true;
            state.textContent = "读取回复中…";
            try {
              const data = await api({
                scope: item.scope || scope,
                parent: item.id,
                ...(nextCursor ? { before: nextCursor } : {}),
              });
              data.items.forEach((i) =>
                list.append(card(i, true, item.author_code)),
              );
              nextCursor = data.next;
              loaded = true;
              next.hidden = !nextCursor;
              next.textContent = "更多回复";
              state.textContent = data.items.length ? "" : "回复已被收起。";
            } catch (e) {
              state.textContent = e.message;
              next.hidden = false;
              next.textContent = "重试";
            } finally {
              busy = false;
              next.disabled = false;
            }
          }
          next.addEventListener("click", replies);
          details.addEventListener("toggle", () => {
            if (details.open && !loaded) replies();
          });
          details.append(summary, list, state, next);
          article.append(details);
        }
      }
      return article;
    }
    async function load(reset = true) {
      if (reading) return;
      reading = true;
      loadButton.disabled = true;
      more.disabled = true;
      if (filter) filter.disabled = true;
      status.textContent = "正在读取已公开的讨论…";
      try {
        const data = await api({
          scope: feed,
          ...(filter?.value ? { category: filter.value } : {}),
          ...(!reset && cursor ? { before: cursor } : {}),
        });
        if (reset) entries.replaceChildren();
        data.items.forEach((item) => entries.append(card(item)));
        cursor = data.next;
        more.hidden = !cursor;
        loadButton.textContent = "刷新";
        status.textContent = entries.children.length
          ? "只展示已通过审核的内容。"
          : "还没有公开的内容，欢迎留下第一个声音。";
      } catch (e) {
        status.textContent = e.message || "读取失败，请稍后重试。";
      } finally {
        reading = false;
        loadButton.disabled = false;
        more.disabled = false;
        if (filter) filter.disabled = false;
      }
    }
    function hint() {
      const category = form.elements.category?.value;
      find("[data-community-hint]").textContent = parentId
        ? "回复也需要审核，通过后才会公开。"
        : category === "find"
          ? "寻游线索：大概哪年玩过？画面、角色、视角、关卡和操作有什么特点？"
          : category === "feedback"
            ? "问题反馈：请附游戏名称、浏览器与设备、重现步骤。"
            : "分享心得或有用的线索，内容最多 2000 字。";
    }
    async function challenge() {
      if (widget !== null || mounting) return;
      mounting = true;
      formStatus.textContent = "正在准备人机验证…";
      try {
        const service = await loadTurnstile();
        widget = service.render(find("[data-community-challenge]"), {
          sitekey: root.dataset.siteKey,
          action: "community",
          theme: "auto",
          callback: (value) => {
            token = value;
            if (!receipt) formStatus.textContent = "验证完成，可以送交审核。";
          },
          "expired-callback": () => {
            token = "";
            if (!receipt) formStatus.textContent = "验证已过期，请重新验证。";
          },
          "error-callback": () => {
            token = "";
            if (!receipt)
              formStatus.textContent = "验证失败，请检查网络，关闭表单后重试。";
          },
        });
      } catch (e) {
        formStatus.textContent = e.message;
      } finally {
        mounting = false;
      }
    }
    async function openForm(item = null) {
      if (submitting) return;
      if (!identity) {
        status.textContent = "饼干登录组件未能加载，请刷新页面后重试。";
        return;
      }
      if (!(await identity.ensure())) return;
      receipt = false;
      formStatus.textContent = "";
      parentId = item?.id || null;
      replyScope = item?.scope || scope;
      form.hidden = false;
      find("[data-community-form-title]").textContent = item
        ? `回复：${item.title || item.nickname}`
        : scope === "board"
          ? "发起一段新讨论"
          : scope.startsWith("article:")
            ? "写下你的阅读感受"
            : "写下你的游玩心得";
      const topic = find("[data-community-topic-fields]");
      if (topic) {
        topic.hidden = !!parentId;
        topic
          .querySelectorAll("input,select")
          .forEach((e) => (e.disabled = !!parentId));
      }
      hint();
      form.scrollIntoView({ block: "nearest" });
      (parentId
        ? form.elements.body
        : form.elements.title || form.elements.body
      ).focus();
      challenge();
    }
    function closeForm() {
      if (submitting) return;
      form.hidden = true;
      if (widget !== null) {
        window.turnstile.remove(widget);
        widget = null;
        token = "";
      }
      writeButton.focus();
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      if (!identity || !(await identity.ensure())) return;
      if (!token) {
        formStatus.textContent = "请先完成人机验证。";
        return;
      }
      const payload = {
        scope: replyScope,
        parent_id: parentId,
        body: form.elements.body.value,
        category: form.elements.category?.value,
        title: form.elements.title?.value,
        token,
      };
      submitting = true;
      form
        .querySelectorAll("input,textarea,select,button")
        .forEach((e) => (e.disabled = true));
      formStatus.textContent = "正在送交审核…";
      try {
        const result = await api(null, payload);
        form.elements.body.value = "";
        if (form.elements.title) form.elements.title.value = "";
        receipt = true;
        formStatus.textContent = result.message;
      } catch (e) {
        receipt = true;
        formStatus.textContent = `${e.message}\n文字已保留；如提交时网络中断，请稍后再查看，避免重复提交。`;
      } finally {
        submitting = false;
        form
          .querySelectorAll("input,textarea,select,button")
          .forEach((e) => (e.disabled = false));
        if (parentId)
          find("[data-community-topic-fields]")
            ?.querySelectorAll("input,select")
            .forEach((e) => (e.disabled = true));
        token = "";
        if (widget !== null) window.turnstile.reset(widget);
      }
    });
    loadButton.addEventListener("click", () => load());
    more.addEventListener("click", () => load(false));
    filter?.addEventListener("change", () => load());
    writeButton.addEventListener("click", () => openForm());
    find("[data-community-cancel]").addEventListener("click", closeForm);
    form.elements.category?.addEventListener("change", hint);
    if (feed === "all") load();
  }
})();
