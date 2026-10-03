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
    let activePicker = null;
    document.addEventListener("click", (event) => {
      if (activePicker && !activePicker.bar.contains(event.target))
        activePicker.close(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activePicker) {
        event.preventDefault();
        activePicker.close(true);
      }
    });
    root.addEventListener("community-identity-changed", (event) => {
      root.querySelectorAll("[data-reaction-owner]").forEach((b) => {
        const mine =
          b.dataset.reactionMine === "true" &&
          b.dataset.reactionOwner === event.detail.public_id;
        b.setAttribute("aria-pressed", String(mine));
        b.closest(".community-reactions")
          ?.querySelector(`[data-reaction-option="${b.dataset.reaction}"]`)
          ?.setAttribute("aria-pressed", String(mine));
        b.setAttribute(
          "aria-label",
          b.dataset.reactionLabel + (mine ? "，已选择，再次点击取消" : ""),
        );
      });
    });
    return (item) => {
      const bar = el("div", "community-reactions"),
        buttons = new Map(),
        options = new Map(),
        toggle = el("button", "community-reaction reaction-add", "😊＋"),
        picker = el("div", "reaction-picker"),
        audience = el("div", "reaction-audience"),
        audienceLink = el("button", "reaction-audience-link", "查看回应者"),
        notice = el("p", "community-reaction-status");
      let hoverTimer,
        leaveTimer,
        audienceRequest = 0;
      const audienceCache = new Map();
      audience.hidden = true;
      audience.id = `reaction-audience-${item.id}-${Math.random().toString(36).slice(2, 8)}`;
      audience.setAttribute("role", "region");
      audience.setAttribute("aria-label", "回应者名单");
      audienceLink.type = "button";
      audienceLink.addEventListener("click", () => showAudience("", true));
      bar.setAttribute("aria-label", "表情回应");
      notice.setAttribute("role", "status");
      toggle.type = "button";
      toggle.dataset.reactionAdd = "";
      toggle.setAttribute("aria-label", "添加表情回应");
      toggle.setAttribute("aria-expanded", "false");
      picker.hidden = true;
      picker.id = `reaction-picker-${item.id}-${Math.random().toString(36).slice(2, 8)}`;
      picker.setAttribute("role", "group");
      picker.setAttribute("aria-label", "选择回应表情");
      toggle.setAttribute("aria-controls", picker.id);
      function closePicker(focus) {
        clearTimeout(hoverTimer);
        clearTimeout(leaveTimer);
        audienceRequest++;
        audience.hidden = true;
        buttons.forEach((b) => b.removeAttribute("aria-describedby"));
        picker.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        if (activePicker?.bar === bar) activePicker = null;
        if (focus) toggle.focus();
      }
      function leaveAudience() {
        clearTimeout(hoverTimer);
        leaveTimer = setTimeout(() => {
          if (!audience.contains(document.activeElement)) closePicker(false);
        }, 250);
      }
      audience.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
      audience.addEventListener("pointerleave", leaveAudience);
      async function showAudience(key, focus = false) {
        if (busy) return;
        activePicker?.close(false);
        clearTimeout(hoverTimer);
        clearTimeout(leaveTimer);
        picker.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        activePicker = { bar, close: closePicker };
        audience.hidden = false;
        const ticket = ++audienceRequest;
        audience.replaceChildren();
        const title = el(
          "strong",
          "",
          key
            ? `${catalog.find((a) => a.key === key).emoji} 的回应者`
            : "所有回应者",
        );
        const close = el("button", "reaction-audience-close", "关闭");
        close.type = "button";
        close.addEventListener("click", () => closePicker(true));
        const list = el("ul", "reaction-audience-list");
        const status = el("p", "reaction-audience-status", "正在加载…");
        status.setAttribute("role", "status");
        const more = el("button", "reaction-audience-more", "查看更多");
        more.type = "button";
        more.hidden = true;
        audience.append(title, close, list, status, more);
        if (key) buttons.get(key).setAttribute("aria-describedby", audience.id);
        if (focus) close.focus();
        let cursor = "";
        async function load() {
          more.disabled = true;
          status.textContent = "正在加载…";
          const cacheKey = key + ":" + cursor;
          try {
            let cached = audienceCache.get(cacheKey);
            if (!cached || Date.now() - cached.time > 30000) {
              const params = new URLSearchParams();
              if (key) params.set("reaction", key);
              if (cursor) params.set("after", cursor);
              const response = await fetch(
                base + "/api/entries/" + item.id + "/reactions?" + params,
                {
                  credentials: "omit",
                  cache: "no-store",
                  signal: AbortSignal.timeout(10000),
                },
              );
              const data = await response.json();
              if (!response.ok) throw Error(data.error || "暂时无法加载回应者");
              cached = { data, time: Date.now() };
              // Bound the per-card cache, including long paginated lists.
              if (audienceCache.size >= 12)
                audienceCache.delete(audienceCache.keys().next().value);
              audienceCache.set(cacheKey, cached);
            }
            if (ticket !== audienceRequest) return;
            for (const person of cached.data.items) {
              const row = el("li", "");
              const emoji =
                catalog.find((a) => a.key === person.reaction)?.emoji || "";
              const name = el("span", "");
              name.append(
                el("span", "", emoji + " "),
                el(
                  "span",
                  person.public_id === "00000000" ? "community-owner-name" : "",
                  person.nickname,
                ),
              );
              row.append(name, el("small", "", `#${person.public_id}`));
              list.append(row);
            }
            cursor = cached.data.next || "";
            more.hidden = !cursor;
            more.textContent = "查看更多";
            status.textContent = list.children.length ? "" : "暂无回应";
          } catch (error) {
            if (ticket !== audienceRequest) return;
            status.textContent = error.message;
            more.hidden = false;
            more.textContent = "重试";
          } finally {
            more.disabled = false;
          }
        }
        more.addEventListener("click", load);
        await load();
      }
      toggle.addEventListener("click", () => {
        if (busy) return;
        if (!picker.hidden) {
          closePicker(false);
          return;
        }
        activePicker?.close(false);
        picker.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        activePicker = { bar, close: closePicker };
        options.values().next().value?.focus();
      });
      let rows = item.reactions || [],
        actor = item.reactions_owner || null,
        busy = false;
      function render() {
        audienceLink.hidden = !rows.some((r) => r.count > 0);
        for (const [key, b] of buttons) {
          const r = rows.find((r) => r.key === key),
            a = catalog.find((a) => a.key === key);
          b.hidden = !(r?.count > 0);
          b.querySelector(".reaction-count").textContent = String(
            r?.count || 0,
          );
          b.dataset.reactionOwner = actor || "";
          b.dataset.reactionMine = String(!!r?.mine);
          b.dataset.reactionLabel = `${a.label}，${r?.count || 0} 人回应`;
          const mine = !!r?.mine && actor === identity?.getId();
          b.setAttribute("aria-pressed", String(mine));
          options.get(key)?.setAttribute("aria-pressed", String(mine));
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
        b.addEventListener("pointerenter", (event) => {
          if (event.pointerType === "touch") return;
          clearTimeout(leaveTimer);
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => showAudience(a.key), 220);
        });
        b.addEventListener("pointerleave", leaveAudience);
        b.addEventListener("keydown", (event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            showAudience(a.key, true);
          }
        });
        b.title = `${a.label}：悬停查看回应者，点击回应或取消；按 ↑ 查看名单`;
        const option = el("button", "community-reaction reaction-option");
        option.type = "button";
        option.dataset.reactionOption = a.key;
        option.setAttribute("aria-label", a.label);
        option.title = a.label;
        const optionIcon = el("span", "reaction-emoji", a.emoji);
        optionIcon.setAttribute("aria-hidden", "true");
        option.append(optionIcon);
        options.set(a.key, option);
        picker.append(option);
        async function choose(fromPicker) {
          if (busy) return;
          busy = true;
          closePicker(false);
          notice.classList.remove("reaction-status-quiet");
          if (!identity || !(await identity.ensure())) {
            notice.textContent = "请先登录饼干再回应。";
            busy = false;
            return;
          }
          [...buttons.values(), ...options.values(), toggle].forEach(
            (b) => (b.disabled = true),
          );
          notice.textContent = "";
          const selected =
              actor === identity.getId() &&
              rows.some((r) => r.key === a.key && r.mine),
            desired = selected ? null : a.key;
          let focusTarget = null;
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
            audienceCache.clear();
            render();
            if (desired) burst(b, a.emoji);
            notice.textContent = desired ? "已回应" : "已取消回应";
            notice.classList.add("reaction-status-quiet");
            if (fromPicker || b.hidden) focusTarget = b.hidden ? toggle : b;
          } catch (e) {
            notice.textContent = e.message + "；可刷新确认。";
            focusTarget = toggle;
          } finally {
            busy = false;
            [...buttons.values(), ...options.values(), toggle].forEach(
              (b) => (b.disabled = false),
            );
            focusTarget?.focus();
          }
        }
        b.addEventListener("click", () => choose(false));
        option.addEventListener("click", () => choose(true));
      }
      picker.append(audienceLink);
      bar.append(toggle, picker, audience);
      bar.append(notice);
      render();
      return bar;
    };
  };
})();
