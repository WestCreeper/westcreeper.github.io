const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const origin = process.env.BLOG_PREVIEW || "http://127.0.0.1:4000";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXE
      ? { executablePath: process.env.BROWSER_EXE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const publicRequests = [];
    const game = {
      id: 9,
      scope: "game:dadnme",
      category: "game",
      nickname: "玩家甲",
      body: "这个游戏的连招很有意思！",
      title: "",
      progress: "open",
      created_at: "2026-10-02T08:00:00Z",
      replies: 1,
    };
    const board = {
      ...game,
      id: 10,
      scope: "board",
      category: "find",
      title: "寻找童年的闯关游戏",
      body: "主角会搬箱子，想找回这部游戏。",
      replies: 0,
    };
    await page.addInitScript(() => {
      window.turnstile = {
        render: (node, options) => {
          options.callback("mock-test-token");
          return 1;
        },
        reset: () => {},
        remove: () => {},
      };
    });
    await page.route(
      "https://westcreeper-community.xiaoshuochyo.workers.dev/api/entries**",
      async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        publicRequests.push({
          url,
          data: req.method() === "POST" ? req.postDataJSON() : null,
        });
        if (req.method() === "POST")
          return route.fulfill({
            json: { message: "已送交审核，通过后会出现在这里。" },
            status: 202,
          });
        const items = url.searchParams.has("parent")
          ? [
              {
                ...game,
                id: 11,
                parent_id: 9,
                body: "可以试试组合按键。",
                replies: 0,
              },
            ]
          : url.searchParams.get("category") === "game"
            ? [game]
            : [board, game];
        return route.fulfill({ json: { items, next: null } });
      },
    );
    await page.goto(origin + "/guestbook/");
    await page.locator(".community-card").nth(1).waitFor();
    assert.equal(publicRequests[0].url.searchParams.get("scope"), "all");
    assert.equal(
      await page.locator('.main-nav a[aria-current="page"]').innerText(),
      "留言板",
    );
    assert.equal(
      await page.locator(".community-game-link").getAttribute("href"),
      "/swf/games/dadnme/",
    );
    await page.locator("[data-community-category]").selectOption("game");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-community-entries] > article")
          .length === 1,
    );
    await page.locator(".community-card summary").click();
    await page.locator(".community-replies article").waitFor();
    assert.equal(
      publicRequests.at(-1).url.searchParams.get("scope"),
      "game:dadnme",
    );
    await page.getByRole("button", { name: "回复", exact: true }).click();
    await page.locator("input[name=nickname]").fill("西部苦力怕");
    await page.locator("textarea[name=body]").fill("感谢分享连招心得");
    await page.getByRole("button", { name: "送交审核" }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-community-form-status]")
        .textContent.includes("已送交审核"),
    );
    assert.equal(publicRequests.at(-1).data.scope, "game:dadnme");
    assert.equal(publicRequests.at(-1).data.parent_id, 9);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    const screenshot = path.join(
      os.tmpdir(),
      "westcreeper-community-desktop.png",
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    for (const width of [390, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow at ${width}`,
      );
      if (width === 390) {
        await page.locator("[data-menu-toggle]").click();
        assert.ok(
          await page.locator('.main-nav a[href="/guestbook/"]').isVisible(),
        );
        await page.locator("[data-menu-toggle]").click();
        await page.screenshot({
          path: path.join(os.tmpdir(), "westcreeper-community-mobile.png"),
          fullPage: true,
        });
      }
      if (width > 780) {
        const boxes = await page
          .locator(".brand,.main-nav,.header-actions")
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const r = n.getBoundingClientRect();
              return {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
              };
            }),
          );
        for (let i = 1; i < boxes.length; i++)
          assert.ok(
            boxes[i].left >= boxes[i - 1].right ||
              boxes[i].top >= boxes[i - 1].bottom,
            `header overlap at ${width}`,
          );
      }
    }
    let rows = [{ ...board, status: "approved", revision: 1, parent_id: null }];
    const adminRequests = [];
    await page.route("http://community.test/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.pathname.startsWith("/api/admin/entries")) {
        if (req.method() === "GET")
          return route.fulfill({
            json: { items: rows, next: null, moderator: "owner@example.test" },
          });
        const data = req.postDataJSON();
        adminRequests.push(data);
        if (data.action === "delete") rows = [];
        else if (data.action === "edit")
          rows = rows.map((i) => ({ ...i, ...data, revision: i.revision + 1 }));
        else
          rows = rows.map((i) => ({
            ...i,
            status: data.status,
            progress: data.progress,
            revision: i.revision + 1,
          }));
        return route.fulfill({ json: { message: "已保存。" } });
      }
      const name = url.pathname.endsWith(".js")
        ? "admin.js"
        : url.pathname.endsWith(".css")
          ? "admin.css"
          : "index.html";
      return route.fulfill({
        body: readFileSync(path.join(__dirname, "admin", name)),
        contentType: name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html",
      });
    });
    await page.goto("http://community.test/admin/");
    await page.locator("#entries article").waitFor();
    await page.locator("#filter").selectOption("all");
    await page.locator("#refresh").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator(".editor textarea").fill("已修正的留言内容");
    await page.getByRole("button", { name: "保存编辑", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("#entries .body")?.textContent ===
        "已修正的留言内容",
    );
    assert.equal(adminRequests[0].action, "edit");
    assert.equal(adminRequests[0].expected_revision, 1);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "删除", exact: true }).click();
    assert.equal(adminRequests.length, 1);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), "westcreeper-community-admin-mobile.png"),
      fullPage: true,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll("#entries article").length === 0,
    );
    assert.equal(adminRequests.at(-1).expected_revision, 2);
    assert.equal(adminRequests.at(-1).action, "delete");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          passed: true,
          screenshot,
          checks:
            "board auto-load/category/game replies, text submission, navigation 390/820/1024/1440, admin edit/delete and confirmation",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
