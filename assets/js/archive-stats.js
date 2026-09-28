(() => {
  "use strict";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const active = new Map();
  const finish = () => {
    active.forEach((frame, node) => {
      cancelAnimationFrame(frame);
      node.textContent = node.dataset.statCount;
    });
    active.clear();
  };
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        if (motion.matches || document.hidden) return;
        const start = performance.now(),
          total = Number(target.dataset.statCount);
        const tick = (now) => {
          const progress = Math.min(1, (now - start) / 700);
          target.textContent = String(
            Math.round(total * (1 - (1 - progress) ** 3)),
          );
          if (progress < 1) active.set(target, requestAnimationFrame(tick));
          else active.delete(target);
        };
        active.set(target, requestAnimationFrame(tick));
      });
    },
    { threshold: 0.5 },
  );
  document
    .querySelectorAll("[data-stat-count]")
    .forEach((node) => observer.observe(node));
  motion.addEventListener("change", finish);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish();
  });
  addEventListener("pagehide", finish);
})();
