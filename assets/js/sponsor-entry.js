(() => {
  "use strict";
  const entry = document.querySelector("[data-sponsor-entry]");
  if (!entry) return;
  const key = "wc-sponsor-dismissed-until";
  const week = 7 * 24 * 60 * 60 * 1000;
  try {
    const until = Number(localStorage.getItem(key));
    if (
      Number.isFinite(until) &&
      until > Date.now() &&
      until <= Date.now() + week
    )
      return;
  } catch (_) {
    /* Storage is optional. */
  }
  entry.hidden = false;
  document.body.classList.add("has-sponsor-entry");
  const dismiss = () => {
    entry.hidden = true;
    document.body.classList.remove("has-sponsor-entry");
  };
  const close = entry.querySelector("[data-sponsor-dismiss]");
  const link = entry.querySelector(".sponsor-entry-link");
  const form = entry.querySelector("[data-sponsor-dismiss-form]");
  const remember = entry.querySelector("[data-sponsor-dismiss-week]");
  const cancel = () => {
    form.hidden = true;
    link.hidden = false;
    close.setAttribute("aria-expanded", "false");
    close.focus({ preventScroll: true });
  };
  close.addEventListener("click", () => {
    if (!form.hidden) {
      cancel();
      return;
    }
    link.hidden = true;
    form.hidden = false;
    remember.checked = false;
    close.setAttribute("aria-expanded", "true");
    remember.focus({ preventScroll: true });
  });
  entry
    .querySelector("[data-sponsor-dismiss-cancel]")
    .addEventListener("click", cancel);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    dismiss();
    if (remember.checked) {
      try {
        localStorage.setItem(key, String(Date.now() + week));
      } catch (_) {}
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key && Number(event.newValue) > Date.now()) dismiss();
  });
})();
