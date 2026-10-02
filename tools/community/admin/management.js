(() => {
  const $ = (s) => document.querySelector(s),
    el = (tag, text) => {
      const e = document.createElement(tag);
      if (text) e.textContent = text;
      return e;
    };
  function show(id) {
    document
      .querySelectorAll("[data-management-panel]")
      .forEach((e) => (e.hidden = e.id !== id));
    document
      .querySelectorAll("[data-panel]")
      .forEach((e) =>
        e.setAttribute("aria-pressed", String(e.dataset.panel === id)),
      );
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
      .catch(() => ({ error: "请刷新后重新登录后台。" }));
    if (!r.ok) throw new Error(value.error || "请求失败");
    return value;
  }
  function label(name, input) {
    const e = el("label", name);
    e.append(input);
    return e;
  }
  function action(parent, title, fn) {
    const b = el("button", title);
    b.type = "button";
    b.addEventListener("click", fn);
    parent.append(b);
    return b;
  }
  let recoveryPending = false;
  window.addEventListener("beforeunload", (event) => {
    if (recoveryPending) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  function deliverRecovery(data) {
    const dialog = el("dialog");
    dialog.className = "recovery-dialog";
    dialog.setAttribute("aria-label", "新恢复码，只显示一次");
    dialog.append(
      el("h2", "新恢复码 · #" + data.public_id),
      el("p", data.message),
      el(
        "p",
        "仅凭昵称、公开留言或来信地址不能证明归属。请通过核验过的私密渠道交付，切勿贴入留言。",
      ),
    );
    const code = el("input");
    code.readOnly = true;
    code.value = data.recovery_code;
    dialog.append(label("新恢复码（只显示一次）", code));
    let backup = `WestCreeper 饼干\n编号：${data.public_id}\n昵称：${data.nickname}\n恢复码：${data.recovery_code}\n登录：https://westcreeper.com/guestbook/\n请登录后自行重置恢复码并妥善保存。\n`;
    action(dialog, "下载交付文件", () => {
      const url = URL.createObjectURL(
        new Blob([backup], { type: "text/plain;charset=utf-8" }),
      );
      const a = el("a");
      a.href = url;
      a.download = "cookie-" + data.public_id + "-recovery.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const close = () => {
      if (!confirm("确认已安全保存或交付新恢复码？关闭后不能再次查看。"))
        return;
      recoveryPending = false;
      code.value = "";
      backup = "";
      dialog.close();
      dialog.remove();
    };
    action(dialog, "我已安全保存", close);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    document.body.append(dialog);
    recoveryPending = true;
    dialog.showModal();
  }
  const loaders = {};
  for (const kind of ["cookies", "inbox"]) {
    const form = $("#" + kind + "-search"),
      list = $("#" + kind + "-list"),
      status = $("#" + kind + "-status"),
      more = $("#" + kind + "-more");
    let cursor = null,
      busy = false;
    const path =
      kind === "cookies" ? "/api/admin/identities" : "/api/admin/inbox";
    async function load(reset = true) {
      if (busy) return;
      busy = true;
      more.disabled = true;
      form
        .querySelectorAll("input,select,button")
        .forEach((e) => (e.disabled = true));
      status.textContent = "正在读取…";
      try {
        const params = new URLSearchParams({
          q: form.elements.q.value,
          state: form.elements.state.value,
        });
        if (!reset && cursor) params.set("before", cursor);
        const data = await api(path + "?" + params);
        if (reset) list.replaceChildren();
        for (const item of data.items) list.append(card(item));
        cursor = data.next;
        more.hidden = !cursor;
        status.textContent = list.children.length
          ? "已加载。"
          : "暂无符合条件的记录。";
      } catch (e) {
        status.textContent = e.message;
      } finally {
        busy = false;
        more.disabled = false;
        form
          .querySelectorAll("input,select,button")
          .forEach((e) => (e.disabled = false));
      }
    }
    function card(item) {
      const a = el("article"),
        result = el("p");
      result.setAttribute("role", "status");
      const note = el("textarea");
      note.rows = 3;
      note.maxLength = kind === "cookies" ? 500 : 1000;
      note.value = item.note || "";
      const buttons = el("div");
      buttons.className = "actions";
      let saving = false;
      async function save(data) {
        if (saving) return;
        saving = true;
        a.querySelectorAll("button").forEach((e) => (e.disabled = true));
        try {
          const v = await api(
            path + "/" + (kind === "cookies" ? item.public_id : item.id),
            {
              ...data,
              expected_revision: item.revision,
              reason: note.value,
              note: note.value,
            },
          );
          if (v.recovery_code) deliverRecovery(v);
          await load();
          status.textContent = v.message;
        } catch (e) {
          result.textContent = e.message + " 如网络中断，请刷新确认结果。";
          a.querySelectorAll("button").forEach((e) => (e.disabled = false));
        } finally {
          saving = false;
        }
      }
      if (kind === "cookies") {
        a.append(window.communityAvatar(item.avatar));
        a.append(
          el("h3", item.nickname + " · #" + item.public_id),
          el(
            "p",
            "头像：" +
              (item.avatar || "moss") +
              (item.public_id === "00000000" ? " · 站长专属身份" : ""),
          ),
          el(
            "p",
            `${item.state === "active" ? "正常" : "已停用"} · ${item.entries} 条留言 · ${item.sessions} 个有效登录`,
          ),
          el(
            "p",
            `领取：${new Date(item.created_at * 1000).toLocaleString("zh-CN")}；可改名：${new Date((item.nickname_changed_at + 604800) * 1000).toLocaleString("zh-CN")}`,
          ),
          label("处理依据（至少 5 字，写入审计）", note),
        );
        action(buttons, "查看留言", () => {
          show("moderation-panel");
          $("#author").value = item.public_id;
          $("#filter").value = "all";
          $("#query").value = "";
          $("#category").value = "";
          $("#kind").value = "";
          $("#progress").value = "";
          $("#search").requestSubmit();
        });
        action(buttons, "核验后重置恢复码", () => {
          if (recoveryPending) return;
          if (note.value.trim().length < 20) {
            result.textContent =
              "请填写至少 20 字的身份归属核验依据；昵称和发件地址不能单独证明归属。";
            return;
          }
          const id = prompt(
            "已完成归属核验后，输入完整饼干编号确认。旧恢复码和全部登录将立即失效。",
          );
          if (id !== item.public_id) {
            result.textContent = "编号不匹配或操作已取消。";
            return;
          }
          if (
            confirm(
              "确认已经独立核验归属，并重置 #" +
                item.public_id +
                " 的恢复码？新码只显示一次，需私密交付。",
            )
          )
            save({
              action: "reset-recovery",
              verified: true,
              confirm_public_id: id,
            });
        });
        for (const [op, title] of [
          [
            item.state === "active" ? "ban" : "unban",
            item.state === "active" ? "停用饼干" : "解除停用",
          ],
          ["revoke", "注销全部设备"],
        ])
          action(buttons, title, () => {
            if (note.value.trim().length < 5) {
              result.textContent = "请填写至少 5 字处理依据。";
              return;
            }
            if (confirm(`确认${title} #${item.public_id}？已有登录会失效。`))
              save({ action: op });
          });
      } else {
        a.append(
          el("h3", item.subject),
          el("p", `发件人：${item.sender}`),
          el(
            "p",
            `收件人：${item.recipient} · ${new Date(item.received_at * 1000).toLocaleString("zh-CN")}`,
          ),
        );
        const details = el("details");
        details.append(el("summary", "查看邮件正文"));
        const content = el("p", item.body);
        content.className = "body";
        details.append(content);
        a.append(details);
        if (item.attachment_count)
          a.append(
            el(
              "p",
              `${item.attachment_count} 个附件未保存；请联系发件人以文字补充。`,
            ),
          );
        a.append(label("内部处理备注", note));
        for (const [state, title] of [
          ["read", "标为已读"],
          ["done", "标为已处理"],
          ["unread", "标为未读"],
        ])
          action(buttons, title, () => save({ state }));
        action(buttons, "删除邮件", () => {
          if (confirm("确认永久删除此邮件正文和备注？"))
            save({ action: "delete" });
        });
      }
      a.append(buttons, result);
      return a;
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      load();
    });
    more.addEventListener("click", () => load(false));
    loaders[kind + "-panel"] = load;
  }
  document.querySelectorAll("[data-panel]").forEach((button) =>
    button.addEventListener("click", () => {
      show(button.dataset.panel);
      loaders[button.dataset.panel]?.();
    }),
  );
})();
