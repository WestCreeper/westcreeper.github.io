const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
// Isolated input-state regression: no browser profile or game saves are touched.
class Node {
  constructor() {
    this.children = [];
    this.events = {};
    this.attrs = {};
    this.dataset = {};
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      add: (v) => classes.add(v),
      remove: (v) => classes.delete(v),
      contains: (v) => classes.has(v),
      toggle: (v, on) => {
        on ??= !classes.has(v);
        on ? classes.add(v) : classes.delete(v);
        return on;
      },
    };
    this.style = { setProperty() {} };
    this.nodes = {};
  }
  addEventListener(type, fn) {
    (this.events[type] ??= []).push(fn);
  }
  emit(type, e = {}) {
    for (const fn of this.events[type] || [])
      fn({ type, preventDefault() {}, ...e });
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n.parentElement)
        n.parentElement.children = n.parentElement.children.filter(
          (c) => c !== n,
        );
      n.parentElement = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  querySelector(s) {
    return (this.nodes[s] ??= new Node());
  }
  querySelectorAll() {
    return [];
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  focus() {}
  setPointerCapture() {}
  getBoundingClientRect() {
    return { x: 0, y: 0, width: 132, height: 132 };
  }
  contains(n) {
    return n === this || this.children.some((c) => c.contains(n));
  }
}
const shell = new Node(),
  document = new Node(),
  window = new Node();
document.body = new Node();
document.body.append(shell);
document.documentElement = new Node();
document.querySelector = () => shell;
document.createElement = () => new Node();
window.scrollTo = () => {};
window.scrollY = 0;
shell.dataset.gameId = "test";
const get = (s) => shell.querySelector(s);
const keyboard = get("#player-keyboard"),
  keys = get("[data-keyboard-keys]");
keyboard.hidden = true;
get("#player-mobile-help").hidden = true;
keyboard.append(keys);
get("[data-keyboard-layout]").value = "arrows";
get("[data-direction-mode]").value = "joystick";
const state = new Map();
const active = new Set(),
  events = [];
const player = new Node();
player.ruffle = () => ({});
player.dispatchEvent = (e) => {
  events.push([e.type, e.code]);
  e.type === "keydown" ? active.add(e.code) : active.delete(e.code);
};
vm.runInNewContext(
  fs.readFileSync(
    path.join(__dirname, "../assets/js/player-controls.js"),
    "utf8",
  ),
  {
    document,
    window,
    localStorage: {
      getItem: (k) => state.get(k) ?? null,
      setItem: (k, v) => state.set(k, v),
    },
    KeyboardEvent: class {
      constructor(type, data) {
        Object.assign(this, { type }, data);
      }
    },
    setTimeout: () => 1,
    setInterval: () => 2,
    clearTimeout() {},
    clearInterval() {},
    console,
  },
);
shell.emit("player-ready", { detail: player });
get("[data-player-keyboard]").emit("click");
get("[data-player-floating]").emit("click");
assert(shell.classList.contains("is-floating-controls"));
assert.equal(keys.parentElement.className, "player-touch-overlay");
assert(keyboard.hidden);
const stick = keys.children[0],
  action = keys.children[1].children[0];
stick.emit("pointerdown", {
  button: 0,
  pointerId: 1,
  clientX: 120,
  clientY: 120,
});
action.emit("pointerdown", { button: 0, pointerId: 2 });
assert.deepEqual([...active].sort(), ["ArrowDown", "ArrowRight", "KeyZ"]);
get("[data-player-touch-toggle]").emit("click");
assert.equal(active.size, 0, "hiding releases diagonal and action keys");
assert(keys.hidden);
assert.equal(get("[data-player-touch-toggle]").attrs["aria-expanded"], "false");
stick.emit("pointermove", { pointerId: 1, clientX: 120, clientY: 10 });
assert.equal(
  active.size,
  0,
  "hidden joystick must not reactivate during an old touch",
);
get("[data-player-touch-toggle]").emit("click");
assert(!keys.hidden);
stick.emit("pointerdown", {
  button: 0,
  pointerId: 3,
  clientX: 120,
  clientY: 10,
});
assert.equal(active.size, 2);
window.emit("resize");
assert.equal(active.size, 0, "rotation releases held keys");
action.emit("pointerdown", { button: 0, pointerId: 4 });
get("[data-player-immersive-unlock]").emit("click");
assert.equal(active.size, 0, "exit releases keys");
assert.equal(keys.parentElement, keyboard);
assert(!keyboard.hidden);
assert(!shell.classList.contains("is-floating-controls"));
get("[data-player-immersive]").emit("click");
assert.equal(keys.parentElement, keyboard, "original docked mode is unchanged");
assert(!shell.classList.contains("is-floating-controls"));
get("[data-player-immersive-unlock]").emit("click");
get("[data-keyboard-layout]").value = "all";
get("[data-keyboard-layout]").emit("change");
assert(get("[data-player-floating]").disabled);
console.log(
  "PASS: diagonal + action multi-touch, hide/reveal, no stale touch after hide, rotation/exit releases, layout restoration, docked mode and full-keyboard guard.",
);
