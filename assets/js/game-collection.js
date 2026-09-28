(() => {
  "use strict";
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .trim();
  document.querySelectorAll("[data-game-collection]").forEach(async (root) => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = "true";
    const grid = root.querySelector("[data-games-grid]");
    const status = root.querySelector("[data-games-status]");
    const archive = root.dataset.mode === "archive";
    const size = Number(root.dataset.limit) || 3;
    const template = root.querySelector("[data-game-template]");
    const card = (game) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector(".game-card-link").href = game.url;
      node.dataset.gameId = game.id;
      const favorite = node.querySelector("[data-favorite]");
      favorite.dataset.favorite = game.id;
      favorite.dataset.title = game.title;
      const lastPlayed = window.WCGameLibrary?.snapshot().recent.find(
        (item) => item.id === game.id,
      );
      if (lastPlayed) {
        const date = new Date(lastPlayed.at);
        node.querySelector("[data-last-played]").textContent =
          `${date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} 玩过`;
      }
      const cover = node.querySelector(".game-cover");
      cover.classList.add("game-cover--" + game.id);
      const image = node.querySelector("img");
      image.src = game.cover;
      image.alt = game.title + "游戏画面";
      image.decoding = "async";
      const badge = node.querySelector(".game-badge");
      badge.textContent = game.language;
      badge.classList.toggle("game-badge--original", !game.translated);
      node.querySelector(".game-cover-caption").textContent =
        game.original_title;
      node.querySelector("h3").textContent = game.title;
      node.querySelector(".game-card-body > p").textContent = game.description;
      node.querySelector("[data-game-tags]").textContent = (
        game.tags || []
      ).join(" · ");
      node.querySelector("[data-game-status]").textContent = game.play_status;
      node
        .querySelector(".play-label")
        .classList.toggle("play-label--notice", !!game.play_note);
      return node;
    };
    try {
      const response = await fetch(root.dataset.gamesUrl);
      if (!response.ok) throw new Error("Games unavailable");
      const games = await response.json();
      if (!Array.isArray(games)) throw new Error("Invalid game index");
      if (!archive) {
        const pool = games.filter((game) => game.id !== root.dataset.exclude);
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        grid.replaceChildren(...pool.slice(0, size).map(card));
        window.WCGameLibrary?.syncButtons();
        status.hidden = pool.length > 0;
        status.textContent = "更多游戏正在整理中。";
        return;
      }
      const chips = [...root.querySelectorAll("[data-filter]")];
      const input = root.querySelector("[data-filter-search]");
      const count = root.querySelector("[data-filter-count]");
      const pagination = root.querySelector("[data-games-pagination]");
      const prev = root.querySelector("[data-page-prev]");
      const next = root.querySelector("[data-page-next]");
      const select = root.querySelector("[data-page-select]");
      const sort = root.querySelector("[data-games-sort]");
      const order = root.querySelector("[data-games-order]");
      const chinese = new Intl.Collator("zh-CN-u-co-pinyin", {
        numeric: true,
        sensitivity: "base",
      });
      const english = new Intl.Collator("en", {
        numeric: true,
        sensitivity: "base",
      });
      let page = 1,
        category = "all",
        libraryView = "all";
      const fromUrl = () => {
        const params = new URLSearchParams(location.search);
        libraryView = ["favorites", "recent"].includes(params.get("view"))
          ? params.get("view")
          : "all";
        const requested = Number(params.get("page"));
        page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
        category = params.get("tag") || "all";
        if (!chips.some((chip) => chip.dataset.filter === category))
          category = "all";
        input.value = params.get("q") || "";
        sort.value = ["title", "original_title", "author"].includes(
          params.get("sort"),
        )
          ? params.get("sort")
          : "default";
        order.value = params.get("order") === "desc" ? "desc" : "asc";
      };
      const update = (writeHistory = false) => {
        const query = normalize(input.value);
        const library = window.WCGameLibrary?.snapshot() || {
          favorites: [],
          recent: [],
        };
        const times = new Map(library.recent.map((item) => [item.id, item.at]));
        const counts = {
          all: games.length,
          favorites: games.filter((g) => library.favorites.includes(g.id))
            .length,
          recent: games.filter((g) => times.has(g.id)).length,
        };
        root.querySelectorAll("[data-library-count]").forEach((node) => {
          node.textContent = counts[node.dataset.libraryCount];
        });
        root
          .querySelectorAll("[data-library-view]")
          .forEach((node) =>
            node.setAttribute(
              "aria-pressed",
              String(node.dataset.libraryView === libraryView),
            ),
          );
        root.querySelector("[data-clear-recent]").hidden =
          libraryView !== "recent" || !library.recent.length;
        sort.options[0].textContent =
          libraryView === "recent" ? "最近玩过优先" : "默认顺序";
        const matched = games.filter(
          (game) =>
            (libraryView === "all" ||
              (libraryView === "favorites"
                ? library.favorites.includes(game.id)
                : times.has(game.id))) &&
            (category === "all" || (game.tags || []).includes(category)) &&
            normalize(
              [
                game.title,
                game.original_title,
                game.author,
                ...(game.tags || []),
                game.description,
                game.language,
              ].join(" "),
            ).includes(query),
        );
        order.disabled = sort.value === "default";
        if (sort.value === "default" && libraryView === "recent")
          matched.sort((a, b) => times.get(b.id) - times.get(a.id));
        if (sort.value !== "default") {
          const collator = sort.value === "original_title" ? english : chinese;
          const direction = order.value === "desc" ? -1 : 1;
          matched.sort((a, b) => {
            const left = normalize(a[sort.value]),
              right = normalize(b[sort.value]);
            // Missing metadata stays last in either direction.
            if (!left || !right)
              return !left === !right
                ? english.compare(a.id, b.id)
                : left
                  ? -1
                  : 1;
            return (
              direction * collator.compare(left, right) ||
              english.compare(a.id, b.id)
            );
          });
        }
        const pages = Math.max(1, Math.ceil(matched.length / size));
        page = Math.min(page, pages);
        const start = (page - 1) * size;
        const visibleGames = matched.slice(start, start + size);
        const sameCards =
          grid.children.length === visibleGames.length &&
          visibleGames.every(
            (game, index) => grid.children[index].dataset.gameId === game.id,
          );
        // Keep cards (and keyboard focus) stable when only a heart changes.
        if (!sameCards) grid.replaceChildren(...visibleGames.map(card));
        window.WCGameLibrary?.syncButtons();
        count.textContent = matched.length
          ? `共 ${games.length} 部 · 符合条件 ${matched.length} 部 · 显示第 ${start + 1}–${Math.min(start + size, matched.length)} 部 · 第 ${page} / ${pages} 页`
          : `共 ${games.length} 部 · 符合条件 0 部`;
        status.hidden = matched.length > 0;
        status.textContent = "没有找到这款游戏，换个关键词或标签试试。";
        if (!counts[libraryView] && libraryView !== "all")
          status.textContent =
            libraryView === "favorites"
              ? "还没有收藏。点击游戏卡片上的收藏按钮，把喜欢的游戏留在这里。"
              : "还没有游玩记录。成功启动游戏后，它会出现在这里。";
        chips.forEach((chip) =>
          chip.setAttribute(
            "aria-pressed",
            String(chip.dataset.filter === category),
          ),
        );
        pagination.hidden = pages <= 1;
        prev.disabled = page === 1;
        next.disabled = page === pages;
        select.replaceChildren(
          ...Array.from(
            { length: pages },
            (_, i) => new Option(`第 ${i + 1} / ${pages} 页`, String(i + 1)),
          ),
        );
        select.value = String(page);
        if (writeHistory) {
          const url = new URL(location.href);
          for (const [key, value] of [
            ["view", libraryView === "all" ? "" : libraryView],
            ["page", page > 1 ? page : ""],
            ["tag", category === "all" ? "" : category],
            ["q", input.value.trim()],
            ["sort", sort.value === "default" ? "" : sort.value],
            [
              "order",
              sort.value !== "default" && order.value === "desc" ? "desc" : "",
            ],
          ]) {
            if (value) url.searchParams.set(key, value);
            else url.searchParams.delete(key);
          }
          history.pushState(null, "", url);
        }
      };
      const turn = (value) => {
        page = value;
        update(true);
        root.scrollIntoView({ block: "start" });
      };
      root.querySelectorAll("[data-library-view]").forEach((button) =>
        button.addEventListener("click", () => {
          libraryView = button.dataset.libraryView;
          page = 1;
          update(true);
        }),
      );
      addEventListener("wc-library-change", () => {
        const focusedId = document.activeElement?.dataset.favorite;
        update();
        if (focusedId) {
          const target = [...grid.querySelectorAll("[data-favorite]")].find(
            (button) => button.dataset.favorite === focusedId,
          );
          (
            target || root.querySelector(`[data-library-view="${libraryView}"]`)
          ).focus({ preventScroll: true });
        }
      });
      prev.addEventListener("click", () => turn(page - 1));
      next.addEventListener("click", () => turn(page + 1));
      select.addEventListener("change", () => turn(Number(select.value)));
      chips.forEach((chip) =>
        chip.addEventListener("click", () => {
          category = chip.dataset.filter;
          page = 1;
          update(true);
        }),
      );
      input.addEventListener("input", () => {
        page = 1;
        update(true);
      });
      [sort, order].forEach((control) =>
        control.addEventListener("change", () => {
          page = 1;
          update(true);
        }),
      );
      addEventListener("popstate", () => {
        fromUrl();
        update();
      });
      fromUrl();
      update();
    } catch (_) {
      status.hidden = false;
      status.textContent = "游戏列表暂时无法加载，请刷新页面重试。";
    }
  });
})();
