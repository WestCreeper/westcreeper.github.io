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
      node.href = game.url;
      node.dataset.gameId = game.id;
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
      node.querySelector("[data-game-category]").textContent = game.category;
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
      let page = 1,
        category = "all";
      const fromUrl = () => {
        const params = new URLSearchParams(location.search);
        const requested = Number(params.get("page"));
        page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
        category = params.get("tag") || "all";
        if (!chips.some((chip) => chip.dataset.filter === category))
          category = "all";
        input.value = params.get("q") || "";
      };
      const update = (writeHistory = false) => {
        const query = normalize(input.value);
        const matched = games.filter(
          (game) =>
            (category === "all" || game.category === category) &&
            normalize(
              [
                game.title,
                game.original_title,
                game.description,
                game.language,
              ].join(" "),
            ).includes(query),
        );
        const pages = Math.max(1, Math.ceil(matched.length / size));
        page = Math.min(page, pages);
        const start = (page - 1) * size;
        grid.replaceChildren(...matched.slice(start, start + size).map(card));
        count.textContent = matched.length
          ? `共 ${games.length} 部 · 符合条件 ${matched.length} 部 · 显示第 ${start + 1}–${Math.min(start + size, matched.length)} 部 · 第 ${page} / ${pages} 页`
          : `共 ${games.length} 部 · 符合条件 0 部`;
        status.hidden = matched.length > 0;
        status.textContent = "没有找到这款游戏，换个关键词或分类试试。";
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
            ["page", page > 1 ? page : ""],
            ["tag", category === "all" ? "" : category],
            ["q", input.value.trim()],
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
