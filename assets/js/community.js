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
      status.textContent =
        "新讨论区正在准备中，暂未开放投稿。可以先到讨论版下方的 GitHub 入口留言。";
      continue;
    }
    const base = apiURL.origin + apiURL.pathname.replace(/\/$/, "");
    const scope = root.dataset.scope;
    let cursor = null,
      reading = false,
      submitting = false,
      parentId = null,
      widget = null,
      mounting = false,
      token = "",
      receipt = false;
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
          credentials: "omit",
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
    function card(item, isReply = false) {
      const article = el("article", null, "community-card");
      const meta = el("div", null, "community-card-meta");
      meta.append(
        el("strong", item.nickname),
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
            { feedback: "意见反馈", find: "寻找游戏", chat: "闲聊交流" }[
              item.category
            ],
            "community-badge",
          ),
        );
        if (item.category !== "chat")
          meta.append(el("span", progressLabel(item), "community-badge"));
      }
      article.append(meta);
      if (item.title) article.append(el("h3", item.title));
      article.append(el("p", item.body, "community-card-body"));
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
                scope,
                parent: item.id,
                ...(nextCursor ? { before: nextCursor } : {}),
              });
              data.items.forEach((i) => list.append(card(i, true)));
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
          scope,
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
    function openForm(item = null) {
      if (submitting) return;
      receipt = false;
      parentId = item?.id || null;
      form.hidden = false;
      find("[data-community-form-title]").textContent = item
        ? `回复：${item.title || item.nickname}`
        : scope === "board"
          ? "发起一段新讨论"
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
      form.elements.nickname.focus();
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
      if (!token) {
        formStatus.textContent = "请先完成人机验证。";
        return;
      }
      const payload = {
        scope,
        parent_id: parentId,
        nickname: form.elements.nickname.value,
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
  }
})();
