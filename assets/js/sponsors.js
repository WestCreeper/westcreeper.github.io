(() => {
  "use strict";
  const list = document.querySelector("[data-sponsor-list]");
  if (!list) return;
  const currentYear = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  const nav = list.querySelector(".sponsor-years");
  const panels = [...list.querySelectorAll("[data-sponsor-panel]")];
  const empty = list.querySelector("[data-sponsor-empty]");
  const count = list.querySelector("[data-sponsor-count]");
  if (!panels.some((panel) => panel.dataset.sponsorPanel === currentYear)) {
    const link = document.createElement("a");
    link.href = `#sponsors-${currentYear}`;
    link.dataset.sponsorYear = currentYear;
    link.setAttribute("aria-controls", `sponsors-${currentYear}`);
    link.append(currentYear);
    const total = document.createElement("span");
    total.textContent = "0 笔";
    link.append(total);
    const next = [...nav.children].find(
      (item) => Number(item.dataset.sponsorYear) < Number(currentYear),
    );
    nav.insertBefore(link, next || null);
    empty.id = `sponsors-${currentYear}`;
    const heading = empty.querySelector("h3");
    heading.id = `sponsor-year-${currentYear}`;
    heading.textContent = currentYear;
    empty.setAttribute("aria-labelledby", heading.id);
  }
  const links = [...nav.querySelectorAll("[data-sponsor-year]")];
  let selected = currentYear;
  const show = (year) => {
    selected = year;
    const panel = panels.find((item) => item.dataset.sponsorPanel === year);
    panels.forEach((item) => {
      item.hidden = item !== panel;
    });
    empty.hidden = !!panel;
    links.forEach((link) => {
      if (link.dataset.sponsorYear === year)
        link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    count.textContent = `共 ${count.dataset.total} 笔赞助 · ${year} 年 ${panel?.dataset.count || 0} 笔 · 按日期倒序`;
  };
  const fromUrl = () => {
    const link = links.find((item) => item.hash === location.hash);
    show(
      link ? link.dataset.sponsorYear : location.hash ? selected : currentYear,
    );
  };
  links.forEach((link) =>
    link.addEventListener("click", (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, "", link.hash);
      show(link.dataset.sponsorYear);
    }),
  );
  addEventListener("hashchange", fromUrl);
  addEventListener("popstate", fromUrl);
  fromUrl();
})();
