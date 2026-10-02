(() => {
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  window.WCReactions = (root, base, identity) => {
    let catalog;
    try {
      catalog = JSON.parse(root.dataset.reactions || "[]");
    } catch {
      return null;
    }
    if (!catalog.length) return null;
    root.addEventListener("community-identity-changed", (event) => {
      root.querySelectorAll("[data-reaction-owner]").forEach((b) => {
        const mine =
          b.dataset.reactionMine === "true" &&
          b.dataset.reactionOwner === event.detail.public_id;
        b.setAttribute("aria-pressed", String(mine));
        b.setAttribute(
          "aria-label",
          b.dataset.reactionLabel + (mine ? "，已选择，再次点击取消" : ""),
        );
      });
    });
    return (item) => {
      const bar = el("div", "community-reactions"),
        buttons = new Map(),
        notice = el("p", "community-reaction-status");
      bar.setAttribute("aria-label", "表情回应");
      notice.setAttribute("role", "status");
      let rows = item.reactions || [],
        actor = item.reactions_owner || null,
        busy = false;
      function render() {
        for (const [key, b] of buttons) {
          const r = rows.find((r) => r.key === key),
            a = catalog.find((a) => a.key === key);
          b.querySelector(".reaction-count").textContent = String(
            r?.count || 0,
          );
          b.dataset.reactionOwner = actor || "";
          b.dataset.reactionMine = String(!!r?.mine);
          b.dataset.reactionLabel = `${a.label}，${r?.count || 0} 人回应`;
          const mine = !!r?.mine && actor === identity?.getId();
          b.setAttribute("aria-pressed", String(mine));
          b.setAttribute(
            "aria-label",
            `${a.label}，${r?.count || 0} 人回应${mine ? "，已选择，再次点击取消" : ""}`,
          );
        }
      }
      function burst(button, emoji) {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        button.classList.remove("reaction-pop");
        void button.offsetWidth;
        button.classList.add("reaction-pop");
        for (let i = 0; i < 5; i++) {
          const p = el("span", "reaction-particle", emoji);
          p.setAttribute("aria-hidden", "true");
          p.style.setProperty("--dx", `${(i - 2) * 19}px`);
          p.style.setProperty("--dy", `${-34 - Math.abs(i - 2) * 8}px`);
          p.style.setProperty("--spin", `${(i - 2) * 20}deg`);
          button.append(p);
          setTimeout(() => p.remove(), 750);
        }
        setTimeout(() => button.classList.remove("reaction-pop"), 750);
      }
      for (const a of catalog) {
        const b = el("button", "community-reaction");
        b.type = "button";
        b.dataset.reaction = a.key;
        const icon = el("span", "reaction-emoji", a.emoji);
        icon.setAttribute("aria-hidden", "true");
        b.append(icon, el("span", "reaction-count", "0"));
        buttons.set(a.key, b);
        bar.append(b);
        b.addEventListener("click", async () => {
          if (busy) return;
          busy = true;
          if (!identity || !(await identity.ensure())) {
            notice.textContent = "请先登录饼干再回应。";
            busy = false;
            return;
          }
          buttons.forEach((b) => (b.disabled = true));
          notice.textContent = "";
          const selected =
              actor === identity.getId() &&
              rows.some((r) => r.key === a.key && r.mine),
            desired = selected ? null : a.key;
          try {
            const r = await fetch(
              base + "/api/entries/" + item.id + "/reactions",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                cache: "no-store",
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ reaction: desired }),
              },
            );
            const data = await r.json();
            if (!r.ok) throw Error(data.error || "暂时无法回应");
            rows = data.reactions;
            actor = data.reactions_owner;
            render();
            if (desired) burst(b, a.emoji);
            notice.textContent = desired ? "已回应" : "已取消回应";
          } catch (e) {
            notice.textContent = e.message + "；可刷新确认。";
          } finally {
            busy = false;
            buttons.forEach((b) => (b.disabled = false));
          }
        });
      }
      bar.append(notice);
      render();
      return bar;
    };
  };
})();
