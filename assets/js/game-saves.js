(() => {
  "use strict";
  const shell = document.querySelector("[data-player-shell]");
  const dialog = document.querySelector("[data-save-dialog]");
  if (!shell || !dialog) return;
  const list = dialog.querySelector("[data-save-list]"),
    status = dialog.querySelector("[data-save-status]");
  const fileInput = dialog.querySelector("[data-save-file]"),
    exportButton = dialog.querySelector("[data-save-export]");
  const applyButton = dialog.querySelector("[data-save-apply]"),
    cancelButton = dialog.querySelector("[data-save-cancel-import]");
  const swf = new URL(shell.dataset.swf, document.baseURI);
  const moviePath = swf.pathname.replace(/^\/|\/$/g, "");
  // Ruffle 0.6.0 uses host/localPath/name (root scope has two slashes).
  // Only accept this SWF's exact scope or an ancestor scope with a single name
  // (or #name/with/slashes), never a sibling game's path.
  const scopes = [];
  let path = moviePath;
  while (true) {
    scopes.push({
      prefix: `${swf.hostname}/${path}/`,
      shared: path !== moviePath,
    });
    if (!path) break;
    const slash = path.lastIndexOf("/");
    path = slash < 0 ? "" : path.slice(0, slash);
  }
  const scopeOf = (key) => {
    if (
      typeof key !== "string" ||
      key.length > 2048 ||
      key.split("/").some((part) => part.startsWith(".")) ||
      /[\x00-\x1f\\]/.test(key)
    )
      return null;
    return scopes.find(({ prefix }) => {
      if (!key.startsWith(prefix)) return false;
      const name = key.slice(prefix.length);
      return name && (!name.includes("/") || name.startsWith("#"));
    });
  };
  const validSOL = (value) => {
    if (typeof value !== "string" || value.length > 6 * 1024 * 1024)
      return false;
    try {
      const bytes = atob(value);
      return (
        bytes.length >= 16 &&
        bytes.charCodeAt(0) === 0 &&
        bytes.charCodeAt(1) === 191 &&
        bytes.slice(6, 10) === "TCSO" &&
        [0, 4, 0, 0, 0, 0].every((n, i) => bytes.charCodeAt(10 + i) === n)
      );
    } catch {
      return false;
    }
  };
  let rows = [],
    importing = false,
    pausedPlayer = null,
    resumeOnClose = false,
    readVersion = 0;
  const selected = () =>
    rows.filter(
      (_, i) => list.querySelector(`[data-save-index="${i}"]`)?.checked,
    );
  const updateButtons = () => {
    exportButton.disabled = importing || !selected().length;
    applyButton.disabled = !selected().length;
  };
  const render = (entries, isImport) => {
    rows = entries;
    importing = isImport;
    list.replaceChildren();
    entries.forEach((entry, index) => {
      const scope = scopeOf(entry.key);
      const label = document.createElement("label");
      label.className = "save-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.saveIndex = index;
      checkbox.checked = !scope.shared;
      const text = document.createElement("span"),
        title = document.createElement("strong"),
        detail = document.createElement("small");
      title.textContent = entry.key.slice(scope.prefix.length);
      detail.textContent = `${scope.shared ? "共享位置 · 请核对归属" : "当前游戏专属位置"} · ${Math.ceil((entry.data.length * 3) / 4 / 1024)} KB · ${entry.key}`;
      text.append(title, detail);
      label.append(checkbox, text);
      list.append(label);
    });
    applyButton.hidden = cancelButton.hidden = !isImport;
    status.textContent = entries.length
      ? isImport
        ? "已读取备份，请核对并选择需要恢复的条目。"
        : "选择要带走的存档，然后导出备份。"
      : "未发现当前游戏专属或共享位置的存档。请先在游戏内保存，再打开这里。";
    updateButtons();
  };
  const refresh = () => {
    try {
      const entries = Object.keys(localStorage)
        .filter((key) => scopeOf(key))
        .map((key) => ({ key, data: localStorage.getItem(key) }))
        .filter((entry) => validSOL(entry.data));
      render(entries, false);
    } catch {
      render([], false);
      status.textContent = "浏览器阻止了存储访问，无法读取或恢复游戏存档。";
    }
  };
  list.addEventListener("change", updateButtons);
  shell.querySelector("[data-player-saves]").addEventListener("click", () => {
    pausedPlayer = shell.querySelector("ruffle-player");
    resumeOnClose = false;
    try {
      const api = pausedPlayer?.ruffle();
      resumeOnClose = api && !api.suspended;
      api?.suspend();
    } catch {
      /* Player may still be loading. */
    }
    refresh();
    dialog.showModal();
  });
  dialog
    .querySelector("[data-save-close]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    readVersion++;
    if (resumeOnClose && pausedPlayer?.isConnected) {
      try {
        pausedPlayer.ruffle().resume();
      } catch {
        /* Failed player stays stopped. */
      }
    }
    pausedPlayer = null;
    resumeOnClose = false;
    fileInput.value = "";
  });
  cancelButton.addEventListener("click", () => {
    readVersion++;
    fileInput.value = "";
    refresh();
  });
  exportButton.addEventListener("click", () => {
    const entries = selected();
    if (!entries.length) return;
    const payload = {
      format: "westcreeper-flash-save",
      version: 1,
      game: shell.dataset.gameId,
      swf: swf.href,
      exportedAt: new Date().toISOString(),
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    if (blob.size > 8 * 1024 * 1024 || entries.length > 256) {
      status.textContent =
        "选中的存档过多，请分批导出（每份最多 8 MB、256 条）。";
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${shell.dataset.gameId}-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    status.textContent = `已生成 ${entries.length} 条存档的备份，请保管好下载文件。`;
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0],
      version = ++readVersion;
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("备份超过 8 MB，无法导入。");
      const data = JSON.parse(await file.text());
      if (version !== readVersion || !dialog.open) return;
      if (
        data?.format !== "westcreeper-flash-save" ||
        data.version !== 1 ||
        data.game !== shell.dataset.gameId
      )
        throw new Error("请选择本站为当前游戏导出的存档备份。");
      if (
        !Array.isArray(data.entries) ||
        !data.entries.length ||
        data.entries.length > 256
      )
        throw new Error("备份中的存档列表无效。");
      const keys = new Set();
      for (const entry of data.entries) {
        if (
          !entry ||
          !scopeOf(entry.key) ||
          !validSOL(entry.data) ||
          keys.has(entry.key)
        )
          throw new Error(
            "备份包含无效、重复或不属于当前游戏位置的条目，未修改任何存档。",
          );
        keys.add(entry.key);
      }
      render(data.entries, true);
    } catch (error) {
      if (version !== readVersion) return;
      refresh();
      status.textContent =
        error instanceof SyntaxError
          ? "文件不是有效的 JSON 备份，未修改任何存档。"
          : error.message;
    } finally {
      fileInput.value = "";
    }
  });
  applyButton.addEventListener("click", () => {
    const entries = selected();
    if (!importing || !entries.length) return;
    const shared = entries.some((entry) => scopeOf(entry.key).shared);
    if (
      !confirm(
        `导入 ${entries.length} 条存档将结束当前这一局并覆盖同名进度。${shared ? "包含共享位置，可能影响其他游戏。" : ""}请确认已备份旧进度并关闭其他游戏标签页。继续导入？`,
      )
    )
      return;
    let backup = [],
      written = [];
    try {
      // Disconnect destroys Ruffle and flushes old data BEFORE replacing it.
      shell.dispatchEvent(new Event("player-stop-for-import"));
      resumeOnClose = false;
      backup = entries.map((entry) => ({
        key: entry.key,
        data: localStorage.getItem(entry.key),
      }));
      for (const entry of entries) {
        localStorage.setItem(entry.key, entry.data);
        written.push(entry.key);
      }
      refresh();
      status.textContent =
        "导入完成。关闭此窗口，点击「开始游戏」读取恢复的进度。";
    } catch {
      let restored = true;
      for (const entry of backup
        .filter((item) => written.includes(item.key))
        .reverse()) {
        try {
          if (entry.data === null) localStorage.removeItem(entry.key);
          else localStorage.setItem(entry.key, entry.data);
        } catch {
          restored = false;
        }
      }
      status.textContent = restored
        ? "导入失败，可能是存储空间不足或浏览器限制；已撤回本次写入。"
        : "导入失败，部分旧存档未能恢复。请保留备份文件，释放空间后重新导入。";
    }
  });
})();
