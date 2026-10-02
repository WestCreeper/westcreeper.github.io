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
      nickname: "西部苦力怕",
      author_code: "00000000",
      author_avatar: "moss",
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
      author_code: "12345678",
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
    let identityEnabled = true,
      profile = {
        public_id: "12345678",
        nickname: "浏览器玩家",
        state: "active",
        rename_after: Math.floor(Date.now() / 1000) + 604800,
        revision: 1,
        avatar: "moss",
      };
    let reactionChoice = null;
    const recoveryCode = "abcd1234-".repeat(7) + "abcd1234";
    await page.route(
      "https://community.westcreeper.com/api/**",
      async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        if (/\/reactions$/.test(url.pathname)) {
          reactionChoice = req.postDataJSON().reaction;
          return route.fulfill({
            json: {
              id: 9,
              reactions_owner: profile?.public_id,
              reactions: reactionChoice
                ? [{ key: reactionChoice, count: 1, mine: true }]
                : [],
            },
          });
        }
        if (url.pathname === "/api/identity/me")
          return route.fulfill({
            json: { enabled: identityEnabled, identity: profile },
          });
        if (url.pathname.startsWith("/api/identity/")) {
          const mode = url.pathname.split("/").pop(),
            data = req.postDataJSON();
          if (mode === "register" || mode === "login") {
            if (mode === "login") {
              assert.equal(data.public_id, "12345678");
              assert.equal(data.recovery_code, recoveryCode);
            }
            profile = {
              public_id: "12345678",
              nickname: "浏览器玩家",
              state: "active",
              rename_after: Math.floor(Date.now() / 1000) + 604800,
              revision: 1,
              avatar: "moss",
            };
          }
          if (mode === "avatar")
            profile = {
              ...profile,
              avatar: data.avatar,
              revision: (profile.revision || 1) + 1,
            };
          if (mode === "logout") profile = null;
          if (mode === "rename")
            return route.fulfill({
              status: 409,
              json: { error: "领取或上次改名后需满 7 天才能更改昵称。" },
            });
          return route.fulfill({
            json: {
              identity: profile,
              message: "操作完成",
              ...(mode === "register" ? { recovery_code: recoveryCode } : {}),
            },
          });
        }
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
                author_code: "87654321",
                author_avatar: "fox",
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
    assert.ok(await page.locator(".community-owner-name").isVisible());
    assert.ok(await page.locator(".community-id-op").isVisible());
    assert.ok(await page.locator(".community-id-reply").isVisible());
    assert.equal(
      publicRequests.at(-1).url.searchParams.get("scope"),
      "game:dadnme",
    );
    await page.getByRole("button", { name: "回复", exact: true }).click();
    assert.equal(
      await page
        .locator("[data-community-form] input[name=nickname]")
        .inputValue(),
      "浏览器玩家",
    );
    await page.locator("textarea[name=body]").fill("感谢分享连招心得");
    await page.getByRole("button", { name: "送交审核" }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-community-form-status]")
        .textContent.includes("已送交审核"),
    );
    assert.equal(publicRequests.at(-1).data.scope, "game:dadnme");
    assert.equal(publicRequests.at(-1).data.parent_id, 9);
    assert.equal(publicRequests.at(-1).data.nickname, undefined);
    const like = page.locator(
      "[data-community-entries] > article > .community-reactions [data-reaction=like]",
    );
    await like.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            "[data-community-entries] > article > .community-reactions [data-reaction=like]",
          )
          .getAttribute("aria-pressed") === "true",
    );
    assert.equal(reactionChoice, "like");
    await like.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            "[data-community-entries] > article > .community-reactions [data-reaction=like]",
          )
          .getAttribute("aria-pressed") === "false",
    );
    assert.equal(reactionChoice, null);
    await page
      .locator(".reaction-particle")
      .first()
      .waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await like.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            "[data-community-entries] > article > .community-reactions [data-reaction=like]",
          )
          .getAttribute("aria-pressed") === "true",
    );
    assert.equal(await page.locator(".reaction-particle").count(), 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
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

    profile = null;
    await page.goto(origin + "/guestbook/");
    await page.locator("[data-cookie-panel]").waitFor();
    await page.getByRole("button", { name: "发起讨论", exact: true }).click();
    assert.ok(!(await page.locator("[data-community-form]").isVisible()));
    await page.getByRole("button", { name: "领取饼干", exact: true }).click();
    await page
      .locator("[data-cookie-form] input[name=nickname]")
      .fill("浏览器玩家");
    await page.locator("[data-cookie-form] input[type=checkbox]").check();
    await page.locator("[data-cookie-form] button[type=submit]").click();
    await page.locator("[data-cookie-backup]").waitFor();
    assert.equal(
      await page.locator("[data-cookie-backup-code]").inputValue(),
      recoveryCode,
    );
    await page.setViewportSize({ width: 390, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), "westcreeper-cookie-mobile.png"),
      fullPage: true,
    });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "我已保存", exact: true }).click();
    await page.getByRole("button", { name: "发起讨论", exact: true }).click();
    assert.equal(
      await page
        .locator("[data-community-form] input[name=nickname]")
        .inputValue(),
      "浏览器玩家",
    );
    assert.ok(
      await page
        .locator("[data-community-form] input[name=nickname]")
        .evaluate((e) => e.readOnly),
    );
    await page.locator("[data-community-cancel]").click();
    await page.locator("[data-cookie-avatars] summary").click();
    await page.locator("[data-cookie-avatar=fox]").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-cookie-avatar=fox]")
          .getAttribute("aria-pressed") === "true",
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), "westcreeper-avatars-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "修改昵称", exact: true }).click();
    await page
      .locator("[data-cookie-form] input[name=nickname]")
      .fill("新昵称");
    await page.locator("[data-cookie-form] button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-cookie-status]")
        .textContent.includes("7 天"),
    );
    await page.locator("[data-cookie-cancel]").click();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.getByRole("button", { name: "恢复码登录", exact: true }).click();
    await page
      .locator("[data-cookie-form] input[name=public_id]")
      .fill("12345678");
    await page
      .locator("[data-cookie-form] input[name=recovery_code]")
      .fill(recoveryCode);
    await page.locator("[data-cookie-form] button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-cookie-summary]")
        .textContent.includes("浏览器玩家"),
    );
    await page.goto(origin + "/swf/games/dadnme/");
    await page.locator("[data-cookie-avatars] summary").waitFor();
    await page.locator("[data-cookie-avatars] summary").click();
    assert.equal(await page.locator("[data-cookie-avatar]").count(), 8);
    await page.locator("[data-community-load]").click();
    await page.locator(".community-card .community-avatar").first().waitFor();
    assert.ok(
      (
        await page
          .locator(".community-card .community-avatar")
          .first()
          .getAttribute("src")
      ).includes("/assets/images/avatars/"),
    );
    assert.equal(
      await page
        .locator(".community-card")
        .first()
        .locator("[data-reaction]")
        .count(),
      6,
    );
    let rows = [{ ...board, status: "approved", revision: 1, parent_id: null }];
    const adminRequests = [];
    await page.route("http://community.test/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (
        url.pathname.startsWith("/api/admin/identities") &&
        req.method() === "POST"
      ) {
        const d = req.postDataJSON();
        adminRequests.push(d);
        return route.fulfill({
          json: {
            message: "已重置恢复码",
            public_id: "12345678",
            nickname: "浏览器玩家",
            recovery_code: recoveryCode,
          },
        });
      }
      if (url.pathname.startsWith("/api/admin/identities"))
        return route.fulfill({
          json: {
            items: [
              {
                id: 1,
                ...profile,
                revision: 1,
                created_at: 1700000000,
                nickname_changed_at: 1700000000,
                entries: 2,
                sessions: 1,
              },
            ],
            next: null,
          },
        });
      if (url.pathname.startsWith("/api/admin/inbox"))
        return route.fulfill({
          json: {
            items: [
              {
                id: 1,
                sender: "visitor@example.test",
                recipient: "contact@westcreeper.com",
                subject: "饼干找回求助",
                body: "<script>evil()</script> 希望找回饼干",
                received_at: 1700000000,
                revision: 1,
                state: "unread",
              },
            ],
            next: null,
          },
        });
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
      const name = url.pathname.endsWith("/avatars.js")
        ? "avatars.js"
        : url.pathname.endsWith("/management.js")
          ? "management.js"
          : url.pathname.endsWith(".js")
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
    await page.getByRole("button", { name: "饼干管理", exact: true }).click();
    await page.locator("#cookies-list article").waitFor();
    assert.match(await page.locator("#cookies-list").innerText(), /12345678/);
    await page
      .locator("#cookies-list textarea")
      .fill("已通过此前私密联系记录与独立核验信息确认用户的身份归属");
    const handle = (d) =>
      d.accept(d.type() === "prompt" ? "12345678" : undefined);
    page.on("dialog", handle);
    await page
      .getByRole("button", { name: "核验后重置恢复码", exact: true })
      .click();
    await page.locator(".recovery-dialog").waitFor();
    assert.equal(
      await page.locator(".recovery-dialog input").inputValue(),
      recoveryCode,
    );
    assert.equal(adminRequests.at(-1).action, "reset-recovery");
    assert.equal(adminRequests.at(-1).verified, true);
    await page.screenshot({
      path: path.join(os.tmpdir(), "westcreeper-admin-recovery.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "我已安全保存", exact: true })
      .click();
    page.off("dialog", handle);
    assert.equal(await page.locator(".recovery-dialog").count(), 0);
    await page.getByRole("button", { name: "邮件收件箱", exact: true }).click();
    await page.locator("#inbox-list article").waitFor();
    await page.locator("#inbox-list summary").click();
    assert.match(
      await page.locator("#inbox-list .body").innerText(),
      /<script>/,
    );
    assert.equal(await page.locator("#inbox-list script").count(), 0);
    await page.screenshot({
      path: path.join(os.tmpdir(), "westcreeper-inbox-mobile.png"),
      fullPage: true,
    });
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
