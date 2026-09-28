(() => {
  "use strict";
  if (window.WCGameLibrary) return;
  const key = "wc-game-library-v1";
  const validId = (id) =>
    typeof id === "string" && /^[a-z0-9][a-z0-9_-]{0,159}$/.test(id);
  const empty = () => ({ favorites: [], recent: [] });
  let state = empty();
  let available = true;
  const read = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      state = {
        favorites: [
          ...new Set(
            (Array.isArray(raw?.favorites) ? raw.favorites : []).filter(
              validId,
            ),
          ),
        ].slice(0, 5000),
        recent: (Array.isArray(raw?.recent) ? raw.recent : [])
          .filter((x) => validId(x?.id) && Number.isFinite(x.at) && x.at > 0)
          .sort((a, b) => b.at - a.at)
          .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
          .slice(0, 60),
      };
    } catch {
      state = empty();
    }
  };
  read();
  const announce = (message) => {
    document.querySelectorAll("[data-library-status]").forEach((node) => {
      node.textContent = message;
    });
  };
  const syncButtons = () => {
    document.querySelectorAll("[data-favorite]").forEach((button) => {
      const saved = state.favorites.includes(button.dataset.favorite);
      button.hidden = false;
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute(
        "aria-label",
        `${saved ? "取消收藏" : "收藏"}：${button.dataset.title || "这款游戏"}`,
      );
      button.textContent = saved ? "♥ 已收藏" : "♡ 收藏";
    });
  };
  const commit = (change) => {
    // Merge with the latest state to avoid overwriting another tab's changes.
    if (available) read();
    change(state);
    try {
      localStorage.setItem(key, JSON.stringify(state));
      available = true;
    } catch {
      available = false;
      announce("浏览器无法保存数据，本次操作仅在当前页面有效。");
    }
    syncButtons();
    window.dispatchEvent(new Event("wc-library-change"));
    return available;
  };
  window.WCGameLibrary = {
    snapshot: () => structuredClone(state),
    syncButtons,
    played: (id) => {
      if (!validId(id)) return;
      commit((data) => {
        data.recent = [
          { id, at: Date.now() },
          ...data.recent.filter((x) => x.id !== id),
        ].slice(0, 60);
      });
    },
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite]");
    if (button && validId(button.dataset.favorite)) {
      const id = button.dataset.favorite;
      const saved = commit((data) => {
        data.favorites = data.favorites.includes(id)
          ? data.favorites.filter((x) => x !== id)
          : [...data.favorites, id];
      });
      if (saved)
        announce(
          state.favorites.includes(id)
            ? "已收藏，随时回来再玩一次。"
            : "已取消收藏。",
        );
    }
    if (
      event.target.closest("[data-clear-recent]") &&
      confirm("清空最近玩过的记录？收藏和游戏存档都会保留。")
    ) {
      if (
        commit((data) => {
          data.recent = [];
        })
      )
        announce("最近玩过的记录已清空。");
    }
  });
  addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    read();
    syncButtons();
    window.dispatchEvent(new Event("wc-library-change"));
  });
  addEventListener("pageshow", () => {
    read();
    syncButtons();
    window.dispatchEvent(new Event("wc-library-change"));
  });
  document
    .querySelector("[data-player-shell]")
    ?.addEventListener("player-ready", () => {
      window.WCGameLibrary.played(
        document.querySelector("[data-player-shell]").dataset.gameId,
      );
    });
  syncButtons();
})();
