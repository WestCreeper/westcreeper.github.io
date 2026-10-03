(() => {
  // Comment pages expose a session summary only; all identity mutations live in the center.
  window.WCIdentity = (root, base, _loadTurnstile, onChange) => {
    const panel = root.querySelector("[data-cookie-session]");
    if (!panel) return null;
    const summary = panel.querySelector("[data-cookie-summary]");
    const status = panel.querySelector("[data-cookie-status]");
    const link = panel.querySelector("[data-cookie-center-link]");
    const center = new URL(panel.dataset.centerUrl, location.origin);
    center.searchParams.set(
      "return",
      location.pathname + location.search + "#comments",
    );
    link.href = center.pathname + center.search;
    let profile = null,
      enabled = false,
      pending = null;
    function render() {
      summary.textContent = profile
        ? `${profile.state === "active" ? "已登录" : "饼干已停用"}：${profile.nickname} · #${profile.public_id}`
        : "尚未登录饼干";
      if (profile?.public_id === "00000000") {
        const name = document.createElement("strong");
        name.className = "community-owner-name";
        name.textContent = profile.nickname;
        summary.replaceChildren(
          document.createTextNode(
            profile.state === "active" ? "已登录：" : "饼干已停用：",
          ),
          name,
          document.createTextNode(" · #00000000"),
        );
      }
      link.textContent = profile ? "我的饼干" : "前往我的饼干登录";
      onChange(enabled && profile?.state === "active" ? profile : null);
      root.dispatchEvent(
        new CustomEvent("community-identity-changed", {
          detail: { public_id: profile?.public_id || null },
        }),
      );
      if (profile)
        root.dispatchEvent(
          new CustomEvent("community-avatar-changed", {
            detail: {
              public_id: profile.public_id,
              avatar: profile.avatar || "moss",
            },
          }),
        );
    }
    function refresh() {
      if (pending) return pending;
      pending = (async () => {
        try {
          const r = await fetch(base + "/api/identity/me", {
            credentials: "include",
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          const data = await r.json();
          if (!r.ok) throw Error(data.error || "请稍后重试");
          enabled = data.enabled === true;
          profile = enabled ? data.identity : null;
          render();
          status.textContent = enabled
            ? ""
            : "饼干服务暂未开放，仍可阅读公开留言。";
          return true;
        } catch (error) {
          profile = null;
          enabled = false;
          render();
          summary.textContent = "暂时无法确认登录状态";
          status.textContent = error.message;
          return false;
        } finally {
          pending = null;
        }
      })();
      return pending;
    }
    const ready = refresh();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) refresh();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "wc-cookie-changed") refresh();
    });
    return {
      getId: () => (profile?.state === "active" ? profile.public_id : null),
      async ensure() {
        await ready;
        if (!(await refresh()) || !enabled) return false;
        if (profile?.state === "active") return true;
        status.textContent = profile
          ? "此饼干已停用，请到我的饼干查看联系信息。"
          : "请先前往我的饼干登录，再返回这里继续交流。";
        link.focus();
        return false;
      },
    };
  };
})();
