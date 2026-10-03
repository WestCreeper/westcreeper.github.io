(() => {
  window.WCIdentity = (root, base, loadTurnstile, onChange) => {
    const panel = root.querySelector("[data-cookie-panel]");
    if (!panel) return null;
    const $ = (s) => panel.querySelector(s),
      form = $("[data-cookie-form]"),
      status = $("[data-cookie-status]"),
      summary = $("[data-cookie-summary]"),
      backup = $("[data-cookie-backup]");
    let profile = null,
      enabled = false,
      mode = "register",
      busy = false,
      widget = null,
      token = "",
      mounting = false,
      failed = false,
      backupText = "";
    let lastProfile = null;
    async function api(path, data) {
      const r = await fetch(base + "/api/identity/" + path, {
        method: data ? "POST" : "GET",
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error || "暂时无法使用饼干");
      return value;
    }
    function render() {
      const fingerprint = JSON.stringify(profile);
      if (lastProfile !== null && fingerprint !== lastProfile) {
        try {
          localStorage.setItem("wc-cookie-changed", String(Date.now()));
        } catch {}
      }
      lastProfile = fingerprint;
      panel.hidden = false;
      summary.textContent = profile
        ? `${profile.nickname} · 饼干 #${profile.public_id}${profile.state === "banned" ? "（已停用）" : ""} · 可改名时间：${new Date(profile.rename_after * 1000).toLocaleString("zh-CN")}`
        : "领取一次，以后自动记住昵称。已有饼干请用恢复码登录。";
      for (const button of panel.querySelectorAll("[data-cookie-open]"))
        button.hidden =
          !enabled ||
          (button.dataset.cookieOpen === "rename" ? !profile : !!profile);
      $("[data-cookie-rotate]").hidden = !profile || profile.state !== "active";
      $("[data-cookie-logout]").hidden = !profile;
      if (profile?.public_id === "00000000") {
        const name = document.createElement("strong");
        name.className = "community-owner-name";
        name.textContent = profile.nickname;
        summary.replaceChildren(
          name,
          document.createTextNode(
            ` · 饼干 #${profile.public_id} · 可改名时间：${new Date(profile.rename_after * 1000).toLocaleString("zh-CN")}`,
          ),
        );
      }
      $("[data-cookie-avatars]").hidden = false;
      const selected = panel.querySelector(
        `[data-cookie-avatar="${profile?.avatar || "moss"}"] img`,
      );
      if (selected) $("[data-cookie-current-avatar]").src = selected.src;
      for (const b of panel.querySelectorAll("[data-cookie-avatar]")) {
        b.disabled = !profile || profile.state !== "active";
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.cookieAvatar === (profile?.avatar || "moss")),
        );
      }
      onChange(enabled ? profile : null);
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
    async function refresh() {
      try {
        const data = await api("me");
        enabled = data.enabled === true;
        profile = enabled ? data.identity : null;
        failed = false;
        render();
        if (!enabled)
          status.textContent = "饼干服务暂未开放，仍可阅读已公开的留言。";
        return true;
      } catch (e) {
        failed = true;
        profile = null;
        enabled = false;
        render();
        status.textContent = "饼干服务读取失败：" + e.message;
        return false;
      }
    }
    function clearChallenge() {
      if (widget !== null) {
        window.turnstile.remove(widget);
        widget = null;
      }
      token = "";
    }
    async function challenge() {
      if (widget !== null || mounting) return;
      mounting = true;
      try {
        const service = await loadTurnstile();
        if (form.hidden || mode === "rename") return;
        widget = service.render($("[data-cookie-challenge]"), {
          sitekey: root.dataset.siteKey,
          action: "community",
          theme: "auto",
          callback: (v) => (token = v),
          "expired-callback": () => (token = ""),
          "error-callback": () => {
            token = "";
            status.textContent = "人机验证失败，请关闭表单后重试。";
          },
        });
      } catch (e) {
        status.textContent = e.message;
      } finally {
        mounting = false;
      }
    }
    function open(next) {
      if (!enabled || busy || !backup.hidden) return;
      clearChallenge();
      mode = next;
      form.hidden = false;
      status.textContent = "";
      $("[data-cookie-title]").textContent = {
        register: "领取新饼干",
        login: "使用恢复码登录",
        rename: "修改昵称",
      }[mode];
      const fields = [
        ["nickname", "name", mode !== "login"],
        ["public_id", "id", mode === "login"],
        ["recovery_code", "code", mode === "login"],
        ["saved_ack", "ack", mode === "register"],
      ];
      for (const [name, field, active] of fields) {
        $(`[data-cookie-${field}-field]`).hidden = !active;
        form.elements[name].disabled = !active;
        form.elements[name].required = active;
      }
      if (mode === "rename") {
        form.elements.nickname.value = profile.nickname;
        status.textContent = "每次改名后需满 7 天才能再次修改。";
      } else challenge();
      form.scrollIntoView({ block: "nearest" });
    }
    function showBackup(data) {
      backup.hidden = false;
      backupText = `WestCreeper 饼干备份\n编号：${data.identity.public_id}\n恢复码：${data.recovery_code}\n请保密。登录入口：https://westcreeper.com/my-cookie/\n`;
      $("[data-cookie-backup-id]").textContent = data.identity.public_id;
      $("[data-cookie-backup-code]").value = data.recovery_code;
      backup.scrollIntoView({ block: "nearest" });
    }
    function clearBackup() {
      backup.hidden = true;
      backupText = "";
      $("[data-cookie-backup-code]").value = "";
    }
    for (const b of panel.querySelectorAll("[data-cookie-open]"))
      b.addEventListener("click", () => open(b.dataset.cookieOpen));
    for (const b of panel.querySelectorAll("[data-cookie-avatar]"))
      b.addEventListener("click", async () => {
        if (busy || !profile) return;
        busy = true;
        const buttons = [...panel.querySelectorAll("[data-cookie-avatar]")];
        buttons.forEach((e) => (e.disabled = true));
        try {
          const data = await api("avatar", {
            avatar: b.dataset.cookieAvatar,
            expected_revision: profile.revision,
          });
          profile = data.identity;
          render();
          status.textContent = data.message;
          root.dispatchEvent(
            new CustomEvent("community-avatar-changed", {
              detail: { public_id: profile.public_id, avatar: profile.avatar },
            }),
          );
        } catch (e) {
          status.textContent = e.message;
          await refresh();
        } finally {
          busy = false;
          buttons.forEach(
            (e) => (e.disabled = !profile || profile.state !== "active"),
          );
        }
      });
    $("[data-cookie-cancel]").addEventListener("click", () => {
      if (!busy) {
        form.hidden = true;
        clearChallenge();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      if (mode !== "rename" && !token) {
        status.textContent = "请先完成人机验证。";
        return;
      }
      busy = true;
      const controls = [...form.querySelectorAll("input,button")];
      const oldDisabled = controls.map((e) => e.disabled);
      controls.forEach((e) => (e.disabled = true));
      status.textContent = "正在处理…";
      try {
        const data = await api(mode, {
          nickname: form.elements.nickname.value,
          public_id: form.elements.public_id.value,
          recovery_code: form.elements.recovery_code.value,
          saved_ack: form.elements.saved_ack.checked,
          token,
        });
        profile = data.identity;
        render();
        form.hidden = true;
        form.elements.recovery_code.value = "";
        clearChallenge();
        status.textContent = data.message;
        if (data.recovery_code) showBackup(data);
        const returned = profile?.public_id;
        await refresh();
        if (returned && !profile)
          status.textContent =
            "浏览器未能保留登录状态，请先保存恢复码，并从 westcreeper.com 正式站重试。";
      } catch (e) {
        status.textContent =
          e.message + " 如刚才网络中断，请先刷新身份状态，避免重复领取。";
        token = "";
        if (widget !== null) window.turnstile.reset(widget);
      } finally {
        busy = false;
        controls.forEach((e, i) => (e.disabled = oldDisabled[i]));
      }
    });
    $("[data-cookie-rotate]").addEventListener("click", async () => {
      if (
        busy ||
        !backup.hidden ||
        !confirm("重置会使旧恢复码及其他设备登录失效。继续后请保存新码。")
      )
        return;
      busy = true;
      try {
        const data = await api("rotate", { confirm: true });
        profile = data.identity;
        render();
        showBackup(data);
        status.textContent = data.message;
      } catch (e) {
        status.textContent = e.message;
      } finally {
        busy = false;
      }
    });
    $("[data-cookie-logout]").addEventListener("click", async () => {
      if (busy || !backup.hidden) return;
      busy = true;
      try {
        await api("logout", {});
        profile = null;
        form.hidden = true;
        clearChallenge();
        render();
        status.textContent = "已退出，可使用编号和恢复码重新登录。";
      } catch (e) {
        status.textContent = e.message;
      } finally {
        busy = false;
      }
    });
    $("[data-cookie-saved]").addEventListener("click", () => {
      if (confirm("确认已保存编号和恢复码？关闭后不会再次显示。"))
        clearBackup();
    });
    $("[data-cookie-download]").addEventListener("click", () => {
      const url = URL.createObjectURL(
        new Blob([backupText], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "westcreeper-cookie-backup.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    window.addEventListener("beforeunload", (event) => {
      if (!backup.hidden) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !busy && backup.hidden) refresh();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted && !busy && backup.hidden) refresh();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "wc-cookie-changed" && !busy && backup.hidden)
        refresh();
    });
    const ready = refresh();
    return {
      refresh,
      getId: () => profile?.public_id || null,
      async ensure() {
        await ready;
        if (!(await refresh()) || failed) return false;
        if (!enabled) return false;
        if (profile?.state === "active") return true;
        panel.hidden = false;
        panel.scrollIntoView({ block: "nearest" });
        status.textContent = profile
          ? "此饼干已停用，请联系站长。"
          : "请先领取饼干，或使用恢复码登录，再发表留言。";
        return false;
      },
    };
  };
})();
