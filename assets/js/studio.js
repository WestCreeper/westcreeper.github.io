(() => {
  "use strict";
  const root = document.documentElement;
  const themeButton = document.querySelector("[data-theme-toggle]");
  const syncTheme = () => {
    const dark = root.dataset.theme === "dark";
    themeButton.setAttribute("aria-pressed", String(dark));
    themeButton.setAttribute(
      "aria-label",
      dark ? "切换浅色模式" : "切换深色模式",
    );
    document.querySelector('meta[name="theme-color"]').content = dark
      ? "#171e19"
      : "#f8f9f5";
  };
  syncTheme();
  themeButton.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("wc-theme", root.dataset.theme);
    } catch (_) {
      /* Private browsing. */
    }
    syncTheme();
  });
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.getElementById("main-nav");
  const closeMenu = () => {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "展开导航");
  };
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "收起导航" : "展开导航");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) closeMenu();
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  matchMedia("(min-width: 781px)").addEventListener("change", closeMenu);

  const normalize = (text) =>
    String(text || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .trim();
  document.querySelectorAll("[data-filter-list]").forEach((list) => {
    const buttons = [...list.querySelectorAll("[data-filter]")];
    const items = [...list.querySelectorAll("[data-filter-item]")];
    const input = list.querySelector("[data-filter-search]");
    let category = new URLSearchParams(location.search).get("tag") || "all";
    if (!buttons.some((button) => button.dataset.filter === category))
      category = "all";
    const update = () => {
      const query = normalize(input.value);
      let count = 0;
      items.forEach((item) => {
        const matches =
          (category === "all" ||
            item.dataset.category.split("|").includes(category)) &&
          normalize(item.dataset.search).includes(query);
        item.hidden = !matches;
        if (matches) count++;
      });
      buttons.forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.filter === category),
        ),
      );
      list.querySelector("[data-filter-count]").textContent =
        `共 ${items.length} 项 · 当前显示 ${count} 项`;
      list.querySelector("[data-filter-empty]").hidden = count > 0;
    };
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        category = button.dataset.filter;
        update();
      }),
    );
    input.addEventListener("input", update);
    update();
  });

  const dialog = document.getElementById("search-dialog");
  const searchInput = document.getElementById("site-search");
  const results = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  let searchIndex;
  let loading;
  let opener;
  const renderSearch = () => {
    if (!searchIndex) return;
    const terms = normalize(searchInput.value).split(/\s+/).filter(Boolean);
    results.replaceChildren();
    if (!terms.length) {
      status.textContent = "输入关键词，探索文章与游戏。";
      return;
    }
    const matches = searchIndex.filter((item) =>
      terms.every((term) =>
        normalize(
          [item.title, item.tags, item.description, item.content].join(" "),
        ).includes(term),
      ),
    );
    status.textContent = matches.length
      ? `找到 ${matches.length} 条结果${matches.length > 30 ? "，显示前 30 条" : ""}`
      : "暂时没有找到，换个关键词试试。";
    matches.slice(0, 30).forEach((item) => {
      const link = document.createElement("a");
      link.className = "search-result";
      const url = new URL(item.url, location.origin);
      if (url.origin !== location.origin) return;
      link.href = url.href;
      [
        ["small", item.type + " / " + item.tags],
        ["strong", item.title],
        ["p", item.description],
      ].forEach(([tag, value]) => {
        const node = document.createElement(tag);
        node.textContent = value;
        link.appendChild(node);
      });
      results.appendChild(link);
    });
  };
  const openSearch = async () => {
    opener = document.activeElement;
    closeMenu();
    if (!dialog.open) dialog.showModal();
    searchInput.focus();
    if (searchIndex) {
      renderSearch();
      return;
    }
    status.textContent = "正在加载搜索索引…";
    if (!loading) {
      loading = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(document.body.dataset.searchUrl, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Search index unavailable");
          const data = await response.json();
          if (!Array.isArray(data)) throw new Error("Invalid search index");
          searchIndex = data;
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    try {
      await loading;
      renderSearch();
    } catch (_) {
      status.textContent =
        "搜索索引暂时未能加载，请检查网络后关闭并重新打开搜索。";
    } finally {
      loading = null;
    }
  };
  document
    .querySelectorAll("[data-open-search]")
    .forEach((button) => button.addEventListener("click", openSearch));
  document
    .querySelector("[data-close-search]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (opener) opener.focus();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  searchInput.addEventListener("input", renderSearch);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  });

  const article = document.querySelector("[data-article-body]");
  if (article) {
    const toc = document.querySelector("[data-article-toc]");
    const headings = article.querySelectorAll("h1, h2, h3");
    if (headings.length > 1) {
      toc.hidden = false;
      headings.forEach((heading, index) => {
        if (!heading.id) heading.id = `section-${index + 1}`;
        const link = document.createElement("a");
        link.href = "#" + encodeURIComponent(heading.id);
        link.textContent = heading.textContent;
        toc.querySelector("nav").appendChild(link);
      });
    }
    article.querySelectorAll("img").forEach((img) => {
      img.loading = "lazy";
      img.decoding = "async";
    });
    const progress = document.querySelector("[data-reading-progress]");
    let scheduled = false;
    const updateProgress = () => {
      const rect = article.getBoundingClientRect();
      const total = article.offsetHeight - innerHeight;
      const fraction =
        total > 0 ? Math.max(0, Math.min(1, -rect.top / total)) : 1;
      progress.style.transform = `scaleX(${fraction})`;
      scheduled = false;
    };
    addEventListener(
      "scroll",
      () => {
        if (!scheduled) {
          scheduled = true;
          requestAnimationFrame(updateProgress);
        }
      },
      { passive: true },
    );
    addEventListener("resize", updateProgress);
    updateProgress();
  }
})();
