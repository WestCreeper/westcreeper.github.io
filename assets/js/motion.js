(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const activeAnimations = new Set();
  const seen = new WeakSet();
  const revealSelector =
    ".hero-copy, .hero-visual, .page-intro, .article-header, .site-note, .section-heading, .post-row, .author-card, .sidebar-note, .sponsor-support, .sponsor-year, .game-card";
  // Animate on arrival, never hide content while waiting for the observer.
  const reveal =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            let order = 0;
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              reveal.unobserve(entry.target);
              if (reduced.matches || document.hidden || !entry.target.animate)
                continue;
              const animation = entry.target.animate(
                [
                  { opacity: 0, translate: "0 18px" },
                  { opacity: 1, translate: "0 0" },
                ],
                {
                  duration: 560,
                  delay: Math.min(order++ * 55, 165),
                  easing: "cubic-bezier(.2,.75,.25,1)",
                  fill: "backwards",
                },
              );
              activeAnimations.add(animation);
              const forget = () => activeAnimations.delete(animation);
              animation.onfinish = forget;
              animation.oncancel = forget;
            }
          },
          { threshold: 0.08 },
        )
      : null;
  const watch = (node) => {
    if (seen.has(node)) return;
    seen.add(node);
    reveal?.observe(node);
  };
  document.querySelectorAll(revealSelector).forEach(watch);
  // Only observe paginated game grids, not the document or Flash player's DOM.
  document.querySelectorAll("[data-games-grid]").forEach((grid) => {
    new MutationObserver((records) => {
      for (const record of records) {
        record.removedNodes.forEach((node) => {
          if (node.nodeType === 1) reveal?.unobserve(node);
        });
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.matches(".game-card")) watch(node);
        });
      }
    }).observe(grid, { childList: true });
  });

  let surface = null,
    frame = 0,
    point = null;
  const reset = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!surface) return;
    surface.classList.remove("is-pointer-lit");
    ["--tilt-x", "--tilt-y", "--light-x", "--light-y"].forEach((key) =>
      surface.style.removeProperty(key),
    );
    surface = null;
  };
  const paint = () => {
    frame = 0;
    if (
      !surface?.isConnected ||
      document.hidden ||
      reduced.matches ||
      !finePointer.matches
    )
      return reset();
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (point.x - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (point.y - rect.top) / rect.height));
    surface.style.setProperty("--tilt-x", `${(0.5 - y) * 5}deg`);
    surface.style.setProperty("--tilt-y", `${(x - 0.5) * 5}deg`);
    surface.style.setProperty("--light-x", `${x * 100}%`);
    surface.style.setProperty("--light-y", `${y * 100}%`);
    surface.classList.add("is-pointer-lit");
  };
  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        reduced.matches ||
        !finePointer.matches ||
        event.pointerType !== "mouse"
      )
        return;
      const next = event.target.closest?.(".hero-visual, .game-card");
      if (next !== surface) {
        reset();
        surface = next;
      }
      if (!surface) return;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  document.addEventListener(
    "pointerout",
    (event) => {
      if (surface && !surface.contains(event.relatedTarget)) reset();
    },
    { passive: true },
  );
  const settle = () => {
    reset();
    activeAnimations.forEach((animation) => animation.cancel());
    activeAnimations.clear();
  };
  reduced.addEventListener("change", settle);
  finePointer.addEventListener("change", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) settle();
  });
  addEventListener("blur", reset);
  addEventListener("pagehide", settle);
  // A single sentinel avoids a scroll handler on every page.
  if ("IntersectionObserver" in window) {
    const sentinel = document.createElement("span");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText =
      "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none";
    document.body.prepend(sentinel);
    const header = document.querySelector(".site-header");
    new IntersectionObserver(([entry]) =>
      header?.classList.toggle("is-scrolled", !entry.isIntersecting),
    ).observe(sentinel);
  }
  document.documentElement.classList.add("motion-ready");
})();
