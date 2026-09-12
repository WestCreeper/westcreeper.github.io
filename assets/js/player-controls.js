(() => {
  "use strict";
  const shell = document.querySelector("[data-player-shell]");
  if (!shell) return;
  const $ = (selector) => shell.querySelector(selector);
  const keyboard = $("#player-keyboard");
  const keyboardButton = $("[data-player-keyboard]");
  const keys = $("[data-keyboard-keys]");
  const help = $("#player-mobile-help");
  const mobileButton = $("[data-player-mobile]");
  const webButton = $("[data-player-web-fullscreen]");
  const fullButton = $("[data-player-fullscreen]");
  const slider = $("[data-player-volume]");
  const mute = $("[data-player-mute]");
  let player = null,
    scale = 100,
    volume = 100,
    previousVolume = 100;
  let savedScroll = 0;
  const held = new Map();
  const pointers = new Map();
  const report = (text) => {
    const status = $("[data-player-control-status]");
    status.textContent = text;
    status.hidden = !text;
  };
  const focusPlayer = () => player?.focus({ preventScroll: true });

  try {
    const saved = localStorage.getItem("wc-player-volume");
    if (saved !== null && Number.isFinite(Number(saved)))
      volume = Math.max(0, Math.min(100, Number(saved)));
  } catch (_) {
    /* Storage is optional. */
  }
  function updateVolume() {
    slider.value = volume;
    $("[data-player-volume-value]").textContent = `${volume}%`;
    mute.textContent = volume ? "音量" : "静音";
    mute.setAttribute("aria-pressed", String(volume === 0));
    mute.setAttribute("aria-label", volume ? "静音" : "取消静音");
    if (player) player.ruffle().volume = volume / 100;
    try {
      localStorage.setItem("wc-player-volume", String(volume));
    } catch (_) {
      /* Storage is optional. */
    }
  }
  slider.addEventListener("input", () => {
    volume = Number(slider.value);
    if (volume) previousVolume = volume;
    updateVolume();
  });
  mute.addEventListener("click", () => {
    if (volume) {
      previousVolume = volume;
      volume = 0;
    } else volume = previousVolume;
    updateVolume();
  });
  previousVolume = volume || 100;
  updateVolume();

  function updateSize() {
    const expanded =
      shell.classList.contains("is-web-fullscreen") ||
      document.fullscreenElement === shell;
    shell.style.setProperty("--player-scale", String(scale / 100));
    $("[data-player-size]").textContent = `${scale}%`;
    $("[data-player-smaller]").disabled = expanded || scale <= 50;
    $("[data-player-larger]").disabled = expanded || scale >= 150;
    $("[data-player-size-reset]").disabled = expanded || scale === 100;
  }
  $("[data-player-smaller]").addEventListener("click", () => {
    scale = Math.max(50, scale - 10);
    updateSize();
  });
  $("[data-player-larger]").addEventListener("click", () => {
    scale = Math.min(150, scale + 10);
    updateSize();
  });
  $("[data-player-size-reset]").addEventListener("click", () => {
    scale = 100;
    updateSize();
  });
  const isolation = new Map();
  function isolatePage(on) {
    if (on) {
      let branch = shell;
      while (branch.parentElement && branch !== document.body) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch && !isolation.has(sibling)) {
            isolation.set(sibling, sibling.inert);
            sibling.inert = true;
          }
        }
        branch = branch.parentElement;
      }
    } else {
      for (const [element, value] of isolation) element.inert = value;
      isolation.clear();
    }
  }
  function setWebFullscreen(on) {
    releaseAll();
    if (on === shell.classList.contains("is-web-fullscreen")) return;
    if (on) savedScroll = window.scrollY;
    shell.classList.toggle("is-web-fullscreen", on);
    document.documentElement.classList.toggle("has-player-overlay", on);
    isolatePage(on);
    webButton.setAttribute("aria-pressed", String(on));
    webButton.textContent = on ? "退出网页全屏" : "网页内全屏";
    updateSize();
    if (!on) {
      window.scrollTo({ top: savedScroll, behavior: "instant" });
      webButton.focus({ preventScroll: true });
    }
  }
  webButton.addEventListener("click", () =>
    setWebFullscreen(!shell.classList.contains("is-web-fullscreen")),
  );
  fullButton.addEventListener("click", async () => {
    releaseAll();
    if (!document.fullscreenEnabled || !shell.requestFullscreen) {
      setWebFullscreen(true);
      report("当前浏览器不支持屏幕全屏，已切换为网页内全屏。");
      return;
    }
    try {
      if (document.fullscreenElement === shell) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch (_) {
      report("浏览器未允许屏幕全屏，可以使用「网页内全屏」。");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    releaseAll();
    const on = document.fullscreenElement === shell;
    fullButton.setAttribute("aria-pressed", String(on));
    fullButton.querySelector("span").textContent = on
      ? "退出屏幕全屏"
      : "屏幕全屏";
    webButton.disabled = on;
    updateSize();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      event.isTrusted &&
      !$("[data-key-config]").open &&
      shell.classList.contains("is-web-fullscreen") &&
      !document.fullscreenElement
    ) {
      event.preventDefault();
      setWebFullscreen(false);
    }
    if (
      event.key === "Tab" &&
      !$("[data-key-config]").open &&
      shell.classList.contains("is-web-fullscreen")
    ) {
      const focusable = [
        ...shell.querySelectorAll(
          "button:not(:disabled), a, input, select, ruffle-player",
        ),
      ].filter((node) => node.getClientRects().length);
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  updateSize();

  function setHelp(on) {
    help.hidden = !on;
    mobileButton.setAttribute("aria-expanded", String(on));
  }
  function setKeyboard(on) {
    releaseAll();
    keyboard.hidden = !on;
    keyboardButton.setAttribute("aria-expanded", String(on));
  }
  mobileButton.addEventListener("click", () => setHelp(help.hidden));
  $("[data-player-help-close]").addEventListener("click", () => setHelp(false));
  keyboardButton.addEventListener("click", () => setKeyboard(keyboard.hidden));
  $("[data-keyboard-close]").addEventListener("click", () =>
    setKeyboard(false),
  );
  $("[data-player-touch-mode]").addEventListener("click", () => {
    setHelp(false);
    setKeyboard(true);
    setWebFullscreen(true);
    if (!player) report("请先点击「开始游戏」，横屏握持可获得更大的游戏画面。");
  });
  $("[data-player-copy-link]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      report("游戏链接已复制，可发送到手机浏览器打开。");
    } catch (_) {
      report("未能复制，请从浏览器地址栏复制游戏链接。");
    }
  });

  const special = {
    ArrowUp: ["↑", "ArrowUp", 38],
    ArrowDown: ["↓", "ArrowDown", 40],
    ArrowLeft: ["←", "ArrowLeft", 37],
    ArrowRight: ["→", "ArrowRight", 39],
    Space: ["空格", " ", 32],
    Enter: ["Enter", "Enter", 13],
    Escape: ["Esc", "Escape", 27],
    Tab: ["Tab", "Tab", 9],
    ShiftLeft: ["Shift", "Shift", 16],
    ControlLeft: ["Ctrl", "Control", 17],
    Backspace: ["退格", "Backspace", 8],
    AltLeft: ["Alt", "Alt", 18],
    CapsLock: ["CapsLock", "CapsLock", 20],
    Delete: ["Delete", "Delete", 46],
    Insert: ["Insert", "Insert", 45],
    Home: ["Home", "Home", 36],
    End: ["End", "End", 35],
    PageUp: ["PageUp", "PageUp", 33],
    PageDown: ["PageDown", "PageDown", 34],
    Minus: ["−", "-", 189],
    Equal: ["=", "=", 187],
    BracketLeft: ["[", "[", 219],
    BracketRight: ["]", "]", 221],
    Backslash: ["\\", "\\", 220],
    Semicolon: [";", ";", 186],
    Quote: ["'", "'", 222],
    Comma: [",", ",", 188],
    Period: [".", ".", 190],
    Slash: ["/", "/", 191],
    Backquote: ["`", "`", 192],
  };
  function keyInfo(code) {
    if (special[code]) return special[code];
    const key = code.replace(/^(Key|Digit)/, "");
    return [key, key.toLowerCase(), key.charCodeAt(0)];
  }
  function sendKey(code, type, repeat = false) {
    if (!player) return;
    const [, key, keyCode] = keyInfo(code);
    const shifted = held.has("ShiftLeft");
    player.dispatchEvent(
      new KeyboardEvent(type, {
        key: shifted && code.startsWith("Key") ? key.toUpperCase() : key,
        code,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        repeat,
        shiftKey: shifted,
        ctrlKey: held.has("ControlLeft"),
        altKey: held.has("AltLeft"),
      }),
    );
  }
  function press(code, owner, button) {
    if (!player) return;
    focusPlayer();
    let entry = held.get(code);
    if (!entry) {
      entry = { owners: new Map() };
      held.set(code, entry);
      sendKey(code, "keydown");
      if (!/^(Shift|Control|Alt|CapsLock)/.test(code))
        entry.delay = setTimeout(() => {
          entry.repeat = setInterval(() => sendKey(code, "keydown", true), 80);
        }, 400);
    }
    entry.owners.set(owner, button);
    button.classList.add("is-held");
    button.setAttribute("aria-pressed", "true");
  }
  function release(code, owner) {
    const entry = held.get(code);
    if (!entry) return;
    const button = entry.owners.get(owner);
    entry.owners.delete(owner);
    if (button && ![...entry.owners.values()].includes(button)) {
      button.classList.remove("is-held");
      button.setAttribute("aria-pressed", "false");
    }
    if (entry.owners.size) return;
    clearTimeout(entry.delay);
    clearInterval(entry.repeat);
    held.delete(code);
    sendKey(code, "keyup");
  }
  function releaseAll() {
    for (const [code, entry] of held)
      for (const owner of [...entry.owners.keys()]) release(code, owner);
    pointers.clear();
  }
  const slots = {
    up: "上",
    left: "左",
    down: "下",
    right: "右",
    a: "A",
    b: "B",
    x: "X",
    y: "Y",
    select: "选择",
    start: "开始",
    l: "L",
    r: "R",
    zl: "ZL",
    zr: "ZR",
  };
  const preset = (mode) => ({
    up: mode === "wasd" ? "KeyW" : "ArrowUp",
    left: mode === "wasd" ? "KeyA" : "ArrowLeft",
    down: mode === "wasd" ? "KeyS" : "ArrowDown",
    right: mode === "wasd" ? "KeyD" : "ArrowRight",
    a: mode === "wasd" ? "KeyJ" : "KeyZ",
    b: mode === "wasd" ? "KeyK" : "KeyX",
    x: mode === "wasd" ? "KeyL" : "KeyC",
    y: "Space",
    select: "Escape",
    start: "Enter",
    l: "",
    r: "",
    zl: "",
    zr: "",
  });
  const availableCodes = [
    ...Object.keys(special),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((x) => "Key" + x),
    ..."0123456789".split("").map((x) => "Digit" + x),
  ];
  const storageKey = "wc-player-keys:" + shell.dataset.gameId;
  let bindings = preset("arrows");
  const layoutSelect = $("[data-keyboard-layout]");
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (
      saved?.version === 1 &&
      ["arrows", "wasd", "custom", "all"].includes(saved.layout)
    ) {
      for (const slot of Object.keys(slots))
        if (
          saved.bindings?.[slot] === "" ||
          availableCodes.includes(saved.bindings?.[slot])
        )
          bindings[slot] = saved.bindings[slot];
      layoutSelect.value = saved.layout;
    }
  } catch (_) {
    /* Ignore unavailable or invalid saved preferences. */
  }
  function persistKeys() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, layout: layoutSelect.value, bindings }),
      );
      return true;
    } catch (_) {
      return false;
    }
  }
  const configDialog = $("[data-key-config]");
  function fillConfig(values) {
    $("[data-key-config-fields]").replaceChildren(
      ...Object.entries(slots).map(([slot, label]) => {
        const wrapper = document.createElement("label");
        wrapper.textContent = label + " 按钮";
        const select = document.createElement("select");
        select.name = slot;
        select.setAttribute("aria-label", label + "按钮映射");
        select.append(
          new Option("隐藏此按钮", ""),
          ...availableCodes.map((code) => new Option(keyInfo(code)[0], code)),
        );
        select.value = values[slot];
        wrapper.append(select);
        return wrapper;
      }),
    );
  }
  $("[data-keyboard-config]").addEventListener("click", () => {
    releaseAll();
    fillConfig(bindings);
    configDialog.showModal();
  });
  const closeConfig = () => {
    configDialog.close();
    $("[data-keyboard-config]").focus({ preventScroll: true });
  };
  $("[data-key-config-close]").addEventListener("click", closeConfig);
  $("[data-key-config-cancel]").addEventListener("click", closeConfig);
  configDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfig();
  });
  shell
    .querySelectorAll("[data-key-preset]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        fillConfig(preset(button.dataset.keyPreset)),
      ),
    );
  $("[data-key-config-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    releaseAll();
    const data = Object.fromEntries(new FormData(event.target));
    for (const slot of Object.keys(slots))
      bindings[slot] = availableCodes.includes(data[slot]) ? data[slot] : "";
    layoutSelect.value = "custom";
    const saved = persistKeys();
    drawKeys();
    closeConfig();
    report(
      saved
        ? "按键配置已应用，并为此游戏保存在当前浏览器。"
        : "按键配置已应用；浏览器未允许保存，关闭页面后需重新设置。",
    );
  });
  function drawKeys() {
    releaseAll();
    const layout = layoutSelect.value;
    keys.dataset.layout = layout;
    const rows =
      layout === "all"
        ? [
            [
              "Escape",
              ..."1234567890".split("").map((x) => "Digit" + x),
              "Backspace",
            ],
            ["Tab", ..."QWERTYUIOP".split("").map((x) => "Key" + x)],
            [
              "ControlLeft",
              ..."ASDFGHJKL".split("").map((x) => "Key" + x),
              "Enter",
            ],
            [
              "ShiftLeft",
              ..."ZXCVBNM".split("").map((x) => "Key" + x),
              "ArrowUp",
            ],
            ["Space", "ArrowLeft", "ArrowDown", "ArrowRight"],
          ]
        : [
            ["up", "left", "down", "right"],
            ["a", "b", "x", "y", "start", "select", "l", "r", "zl", "zr"],
          ];
    keys.replaceChildren(
      ...rows.map((codes, index) => {
        const row = document.createElement("div");
        row.className =
          layout !== "all" && index === 0 ? "virtual-dpad" : "virtual-key-row";
        for (const item of codes) {
          const code = layout === "all" ? item : bindings[item];
          if (!code) {
            if (index === 0 && layout !== "all") {
              const spacer = document.createElement("span");
              spacer.className = "virtual-key-spacer";
              row.append(spacer);
            }
            continue;
          }
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = keyInfo(code)[0];
          button.dataset.virtualKey = code;
          if (layout !== "all") {
            button.dataset.keySlot = item;
            button.title = slots[item] + " → " + keyInfo(code)[0];
            const label =
              { up: "↑", left: "←", down: "↓", right: "→" }[item] ||
              slots[item];
            button.textContent = label;
            if (label !== keyInfo(code)[0]) {
              const caption = document.createElement("small");
              caption.textContent = keyInfo(code)[0];
              button.append(caption);
            }
          }
          button.className = "virtual-key";
          button.disabled = !player;
          button.setAttribute("aria-pressed", "false");
          button.setAttribute(
            "aria-label",
            "游戏按键 " +
              keyInfo(code)[0] +
              (layout !== "all" ? "（" + slots[item] + "按钮）" : ""),
          );
          if (code === "Space") button.classList.add("virtual-key-wide");
          button.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            pointers.set(event.pointerId, code);
            press(code, event.pointerId, button);
          });
          const up = (event) => {
            const heldCode = pointers.get(event.pointerId);
            if (heldCode) release(heldCode, event.pointerId);
            pointers.delete(event.pointerId);
          };
          button.addEventListener("pointerup", up);
          button.addEventListener("pointercancel", up);
          button.addEventListener("lostpointercapture", up);
          button.addEventListener("contextmenu", (event) =>
            event.preventDefault(),
          );
          button.addEventListener("click", (event) => {
            if (event.detail === 0) {
              const owner = Symbol();
              press(code, owner, button);
              setTimeout(() => release(code, owner), 80);
            }
          });
          row.append(button);
        }
        return row;
      }),
    );
  }
  layoutSelect.addEventListener("change", () => {
    if (["arrows", "wasd"].includes(layoutSelect.value))
      bindings = preset(layoutSelect.value);
    drawKeys();
    persistKeys();
  });
  window.addEventListener("blur", releaseAll);
  window.addEventListener("pagehide", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
  document.addEventListener("focusin", (event) => {
    if (player && !player.contains(event.target)) releaseAll();
  });
  shell.addEventListener("player-loading", () => {
    releaseAll();
    player = null;
    drawKeys();
    $("[data-keyboard-hint]").textContent = "正在加载游戏…";
  });
  shell.addEventListener("player-ready", (event) => {
    player = event.detail;
    player.tabIndex = 0;
    updateVolume();
    drawKeys();
    report("");
    $("[data-keyboard-hint]").textContent = "支持长按与多指同时按 · 松手即释放";
  });
  shell.addEventListener("player-failed", () => {
    releaseAll();
    player = null;
    drawKeys();
    $("[data-keyboard-hint]").textContent =
      "游戏未能加载，请先重试「开始游戏」。";
  });
  drawKeys();
})();
