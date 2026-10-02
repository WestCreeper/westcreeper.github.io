import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Small DOM fixture for behavior checks; this does not replace visual browser QA.
class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  async fire(type) {
    for (const fn of this.listeners[type] || [])
      await fn({ preventDefault() {} });
  }
  focus() {}
  scrollIntoView() {}
  remove() {}
  setAttribute() {}
  querySelectorAll(selector) {
    return (this.controls || []).filter((e) =>
      selector.split(",").includes(e.tagName),
    );
  }
}
async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}
function fixture({
  enabled = "true",
  api = "https://community.example.test",
  replyCount = 0,
  feed = "",
  itemScope = "board",
  identityAvailable = true,
  signedIn = true,
} = {}) {
  const nodes = {};
  for (const name of [
    "status",
    "load",
    "write",
    "more",
    "entries",
    "category",
    "form",
    "form-status",
    "form-title",
    "topic-fields",
    "hint",
    "challenge",
    "cancel",
  ])
    nodes[name] = new Element();
  const form = nodes.form;
  form.elements = {
    nickname: new Element("input"),
    title: new Element("input"),
    body: new Element("textarea"),
    category: new Element("select"),
  };
  form.controls = [...Object.values(form.elements), new Element("button")];
  nodes["topic-fields"].controls = [
    form.elements.title,
    form.elements.category,
  ];
  form.elements.category.value = "find";
  const root = new Element();
  root.dataset = { enabled, api, siteKey: "public-key", scope: "board", feed };
  root.querySelector = (s) => nodes[s.slice("[data-community-".length, -1)];
  const calls = [],
    created = [];
  let challenge = null;
  let failPost = false;
  const document = {
    querySelectorAll: () => [root],
    createElement(tag) {
      const e = new Element(tag);
      created.push(e);
      return e;
    },
    head: new Element(),
  };
  const window = {
    WCIdentity: identityAvailable
      ? (root, base, load, changed) => {
          changed(signedIn ? { nickname: "饼干玩家" } : null);
          return { ensure: async () => signedIn };
        }
      : undefined,
    turnstile: {
      render(node, options) {
        challenge = options;
        options.callback("valid");
        return 1;
      },
      reset() {
        challenge.callback("fresh");
      },
      remove() {
        challenge = null;
      },
    },
  };
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST")
      return Response.json(
        failPost
          ? { error: "验证失败" }
          : { message: "已送交审核，通过后会出现在这里。" },
        { status: failPost ? 400 : 202 },
      );
    return Response.json({
      items: [
        {
          id: 1,
          scope: itemScope,
          nickname: "<script>visitor</script>",
          body: "<img src=x onerror=alert(1)>",
          category: "find",
          title: "寻游测试",
          created_at: "2026-10-01T00:00:00Z",
          progress: "open",
          replies: replyCount,
        },
      ],
      next: null,
    });
  };
  vm.runInNewContext(
    readFileSync(
      new URL("../../assets/js/community.js", import.meta.url),
      "utf8",
    ),
    {
      document,
      window,
      fetch: fakeFetch,
      URL,
      URLSearchParams,
      AbortSignal,
      Date,
      Promise,
      setTimeout,
      clearTimeout,
    },
  );
  return {
    nodes,
    form,
    calls,
    created,
    get challenge() {
      return challenge;
    },
    set failPost(value) {
      failPost = value;
    },
  };
}
test("disabled/malformed configuration makes no network requests", async () => {
  for (const config of [
    { enabled: "false" },
    { api: "http://unsafe.test" },
    { api: "not a url" },
  ]) {
    const f = fixture(config);
    await settle();
    assert.equal(f.calls.length, 0);
    assert.equal(f.nodes.load.hidden, true);
    assert.equal(f.nodes.category.disabled, true);
  }
});
test("reading is user-triggered and remote markup is rendered as text", async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0);
  await f.nodes.load.fire("click");
  await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.nodes.entries.children.length, 1);
  assert.ok(
    f.created.some((e) => e.textContent === "<img src=x onerror=alert(1)>"),
  );
  assert.ok(
    !f.created.some((e) => e.tagName === "img" || e.tagName === "script"),
  );
  assert.equal(f.calls[0].options.credentials, "include");
});
test("submission waits for review, clears successful body, retains receipt after captcha reset", async () => {
  const f = fixture();
  await f.nodes.write.fire("click");
  await settle();
  f.form.elements.nickname.value = "玩家";
  f.form.elements.title.value = "一款旧游戏";
  f.form.elements.body.value = "角色拿着一把长剑";
  await f.form.fire("submit");
  assert.equal(f.calls.length, 1);
  assert.equal(f.nodes.entries.children.length, 0);
  assert.equal(f.form.elements.body.value, "");
  assert.match(f.nodes["form-status"].textContent, /已送交审核/);
  assert.equal(JSON.parse(f.calls[0].options.body).scope, "board");
  assert.equal(JSON.parse(f.calls[0].options.body).nickname, undefined);
});
test("failed submissions retain text; reply fields exclude new-topic validation", async () => {
  const f = fixture();
  await f.nodes.load.fire("click");
  await settle();
  const reply = f.created.find(
    (e) => e.tagName === "button" && e.textContent === "回复",
  );
  await reply.fire("click");
  await settle();
  assert.equal(f.form.elements.title.disabled, true);
  assert.equal(f.nodes["topic-fields"].hidden, true);
  f.form.elements.nickname.value = "玩家";
  f.form.elements.body.value = "这部游戏还有续作";
  f.failPost = true;
  await f.form.fire("submit");
  assert.equal(f.form.elements.body.value, "这部游戏还有续作");
  assert.match(f.nodes["form-status"].textContent, /文字已保留/);
  assert.equal(JSON.parse(f.calls.at(-1).options.body).parent_id, 1);
  assert.equal(f.form.elements.title.disabled, true);
});

test("unified board auto-loads and replies retain the original game scope", async () => {
  const f = fixture({ feed: "all", itemScope: "game:dadnme", replyCount: 1 });
  await settle();
  assert.equal(new URL(f.calls[0].url).searchParams.get("scope"), "all");
  f.nodes.category.value = "game";
  await f.nodes.category.fire("change");
  await settle();
  assert.equal(
    new URL(f.calls.at(-1).url).searchParams.get("category"),
    "game",
  );
  const details = f.created.find((e) => e.tagName === "details");
  details.open = true;
  await details.fire("toggle");
  await settle();
  assert.equal(
    new URL(f.calls.at(-1).url).searchParams.get("scope"),
    "game:dadnme",
  );
  const reply = f.created.find(
    (e) => e.tagName === "button" && e.textContent === "回复",
  );
  await reply.fire("click");
  await settle();
  f.form.elements.nickname.value = "玩家";
  f.form.elements.body.value = "这是游戏回复";
  await f.form.fire("submit");
  const payload = JSON.parse(f.calls.at(-1).options.body);
  assert.equal(payload.scope, "game:dadnme");
  assert.equal(payload.parent_id, 1);
  await f.nodes.write.fire("click");
  await settle();
  f.form.elements.body.value = "新的寻找游戏";
  f.form.elements.title.value = "寻找游戏";
  await f.form.fire("submit");
  assert.equal(JSON.parse(f.calls.at(-1).options.body).scope, "board");
});

test("missing identity component and signed-out visitors cannot open or submit nickname-only forms", async () => {
  for (const config of [{ identityAvailable: false }, { signedIn: false }]) {
    const f = fixture(config);
    await f.nodes.write.fire("click");
    await f.form.fire("submit");
    assert.equal(f.calls.length, 0);
    await f.nodes.load.fire("click");
    await settle();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.method, "GET");
  }
});
