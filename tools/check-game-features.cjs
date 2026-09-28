// Run with Node: isolated storage tests; never reads a real browser profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
class Element {
  constructor() {
    this.dataset = {};
    this.children = [];
    this.handlers = {};
    this.attributes = {};
  }
  addEventListener(type, handler) {
    (this.handlers[type] ||= []).push(handler);
  }
  async emit(type, event = {}) {
    for (const handler of this.handlers[type] || []) await handler(event);
  }
  dispatchEvent(event) {
    for (const handler of this.handlers[event.type] || []) handler(event);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  querySelector(selector) {
    const index = selector.match(/data-save-index="(\d+)"/);
    return index
      ? this.children[Number(index[1])]?.children[0]
      : this.nodes?.[selector] || null;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatchEvent({ type: "close" });
  }
  click() {}
  remove() {}
}
function storage(initial = {}) {
  const object = { ...initial };
  Object.defineProperties(object, {
    getItem: { value: (key) => object[key] ?? null },
    setItem: {
      writable: true,
      value: (key, value) => {
        object[key] = String(value);
      },
    },
    removeItem: {
      value: (key) => {
        delete object[key];
      },
    },
  });
  return object;
}
function run(file, context) {
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../assets/js", file), "utf8"),
    context,
  );
}
const base = {
  console,
  URL,
  Blob,
  Event,
  structuredClone,
  atob,
  setTimeout: () => 0,
};
function library(localStorage = storage()) {
  const window = new Element(),
    document = new Element(),
    status = new Element();
  document.querySelectorAll = (q) =>
    q === "[data-library-status]" ? [status] : [];
  const ctx = {
    ...base,
    localStorage,
    window,
    document,
    addEventListener: window.addEventListener.bind(window),
    confirm: () => true,
  };
  run("game-library.js", ctx);
  return { api: window.WCGameLibrary, window, document, status, localStorage };
}
function saves(initial = {}) {
  const shell = new Element(),
    dialog = new Element(),
    document = new Element(),
    open = new Element();
  shell.dataset = {
    gameId: "test-game",
    swf: "https://games.example/games/test.swf",
  };
  shell.nodes = { "[data-player-saves]": open };
  const selectors = [
    "list",
    "status",
    "file",
    "export",
    "apply",
    "cancel-import",
    "close",
  ];
  dialog.nodes = Object.fromEntries(
    selectors.map((s) => [`[data-save-${s}]`, new Element()]),
  );
  const nodes = Object.fromEntries(
    selectors.map((s) => [s, dialog.nodes[`[data-save-${s}]`]]),
  );
  document.nodes = {
    "[data-player-shell]": shell,
    "[data-save-dialog]": dialog,
  };
  document.baseURI = "https://blog.example/";
  document.createElement = () => new Element();
  document.body = new Element();
  const localStorage = storage(initial);
  let blob,
    accepted = true;
  class TestURL extends URL {
    static createObjectURL(b) {
      blob = b;
      return "blob:test";
    }
    static revokeObjectURL() {}
  }
  run("game-saves.js", {
    ...base,
    document,
    localStorage,
    URL: TestURL,
    confirm: () => accepted,
  });
  const payload = (entries) => ({
    format: "westcreeper-flash-save",
    version: 1,
    game: "test-game",
    entries,
  });
  const load = async (data) => {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    nodes.file.files = [{ size: text.length, text: async () => text }];
    await nodes.file.emit("change");
  };
  return {
    shell,
    dialog,
    open,
    nodes,
    localStorage,
    payload,
    load,
    download: () => blob,
    confirm: (value) => {
      accepted = value;
    },
  };
}
// Header-compatible SOL fixtures. Runtime decoding is verified separately in a real game.
const sol = (suffix) =>
  Buffer.concat([
    Buffer.from([0, 191, 0, 0, 0, 0, 84, 67, 83, 79, 0, 4, 0, 0, 0, 0]),
    Buffer.from(suffix),
  ]).toString("base64");
(async () => {
  const l = library();
  const button = { dataset: { favorite: "dadnme" } };
  await l.document.emit("click", {
    target: { closest: (q) => (q === "[data-favorite]" ? button : null) },
  });
  assert.deepEqual(Array.from(l.api.snapshot().favorites), ["dadnme"]);
  assert.deepEqual(
    Array.from(library(l.localStorage).api.snapshot().favorites),
    ["dadnme"],
  );
  for (let i = 0; i < 65; i++) l.api.played(`game-${i}`);
  l.api.played("game-64");
  assert.equal(l.api.snapshot().recent.length, 60);
  assert.equal(
    l.api.snapshot().recent.filter((x) => x.id === "game-64").length,
    1,
  );
  l.localStorage.setItem(
    "wc-game-library-v1",
    JSON.stringify({ favorites: ["other-tab"], recent: [] }),
  );
  await l.window.emit("storage", { key: "wc-game-library-v1" });
  assert.equal(l.api.snapshot().favorites[0], "other-tab");
  assert.equal(
    library(storage({ "wc-game-library-v1": "{bad" })).api.snapshot().favorites
      .length,
    0,
  );
  const denied = storage();
  denied.setItem = () => {
    throw Error("blocked");
  };
  const d = library(denied);
  d.api.played("game-1");
  d.api.played("game-2");
  assert.equal(d.api.snapshot().recent.length, 2);
  assert.match(d.status.textContent, /当前页面/);

  const own = "games.example/games/test.swf/progress";
  const second = "games.example/games/test.swf/achievements";
  const shared = "games.example//common";
  const sibling = "games.example/games/other.swf/progress";
  const s = saves({
    [own]: sol("old"),
    [shared]: sol("shared"),
    [sibling]: sol("other"),
    "wc-theme": "dark",
  });
  await s.open.emit("click");
  assert.equal(s.nodes.list.children.length, 2);
  assert.equal(s.nodes.list.children[0].children[0].checked, true);
  assert.equal(s.nodes.list.children[1].children[0].checked, false);
  await s.nodes.export.emit("click");
  const exported = JSON.parse(await s.download().text());
  assert.equal(exported.entries.length, 1);
  assert.equal(exported.entries[0].key, own);
  const before = JSON.stringify(s.localStorage);
  for (const entries of [
    [{ key: sibling, data: sol("bad") }],
    [{ key: "wc-theme", data: sol("bad") }],
    [{ key: own, data: "bad" }],
    [
      { key: own, data: sol("x") },
      { key: own, data: sol("y") },
    ],
  ]) {
    await s.load(s.payload(entries));
    assert.match(s.nodes.status.textContent, /无效/);
    assert.equal(JSON.stringify(s.localStorage), before);
  }
  await s.load({
    ...s.payload([{ key: own, data: sol("new") }]),
    game: "other",
  });
  assert.match(s.nodes.status.textContent, /当前游戏/);
  await s.load(s.payload([{ key: own, data: sol("new") }]));
  s.confirm(false);
  await s.nodes.apply.emit("click");
  assert.equal(s.localStorage[own], sol("old"));
  s.confirm(true);
  s.shell.addEventListener("player-stop-for-import", () =>
    s.localStorage.setItem(own, sol("flushed")),
  );
  await s.nodes.apply.emit("click");
  assert.equal(s.localStorage[own], sol("new"));
  assert.equal(s.localStorage[sibling], sol("other"));
  assert.equal(s.localStorage["wc-theme"], "dark");
  await s.load(
    s.payload([
      { key: own, data: sol("update") },
      { key: second, data: sol("second") },
    ]),
  );
  const write = s.localStorage.setItem;
  let fail = true;
  s.localStorage.setItem = (key, value) => {
    if (key === second && fail) {
      fail = false;
      throw Error("quota");
    }
    write(key, value);
  };
  await s.nodes.apply.emit("click");
  assert.equal(s.localStorage[own], sol("flushed"));
  assert.equal(s.localStorage[second], undefined);
  assert.match(s.nodes.status.textContent, /撤回/);
  const fresh = saves();
  await fresh.open.emit("click");
  await fresh.load(exported);
  await fresh.nodes.apply.emit("click");
  assert.equal(fresh.localStorage[own], sol("old"));
  console.log(
    "PASS: favorites persistence, recent deduplication/limit, cross-tab sync, corrupted/blocked storage, SOL scope isolation, shared opt-in, export/import round-trip, new-browser restore, invalid payload rejection, cancellation, destroy-before-write and quota rollback.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
