// Run against a local Jekyll preview. All GitHub API responses are mocked.
const assert = require('node:assert/strict');
require('node:fs').mkdirSync('local-preview', {recursive: true});
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.BLOG_PREVIEW_URL || 'http://127.0.0.1:4000';
const api = 'https://api.github.com/repos/WestCreeper/westcreeper.github.io/issues';
const issue = (number, extra = {}) => ({number, title: `游戏回忆 ${number}`, body_text: '谢谢汉化，让我找回童年的游戏。', user: {login: 'visitor'}, state: 'open', created_at: '2026-09-11T01:00:00Z', comments: 0, ...extra});
const reply = id => ({id, user: {login: 'WestCreeper'}, body_text: '感谢支持，欢迎再来玩！', created_at: '2026-09-11T02:00:00Z'});
(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}, colorScheme: 'light', reducedMotion: 'reduce'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let mode = 'normal', replyMode = 'normal';
    const requests = [];
    await page.route('https://api.github.com/**', async route => {
      const send = options => route.fulfill({...options, headers: {'access-control-allow-origin': '*', 'access-control-expose-headers': 'link, x-ratelimit-remaining, x-ratelimit-reset', ...options.headers}});
      const request = route.request();
      const url = new URL(request.url());
      requests.push(url.href);
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers().authorization, undefined);
      assert.equal(request.headers().accept, 'application/vnd.github.text+json');
      const isReply = url.pathname.endsWith('/comments');
      const currentMode = isReply ? replyMode : mode;
      const number = Number(url.searchParams.get('page'));
      if (currentMode === 'network') return route.abort();
      if (currentMode === 'timeout') return; // AbortController ends the browser request.
      if (currentMode === 'limited') return send({status: 403, headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now()/1000)+300)}, json: {message: 'Rate limit'}});
      if (currentMode === 'missing') return send({status: 404, json: {message: 'Not found'}});
      if (currentMode === 'invalid') return send({json: {unexpected: true}});
      if (currentMode === 'empty') return send({json: []});
      if (isReply) {
        return send(number === 1
          ? {json: [reply(1001)], headers: {link: `<${api}/2/comments?page=2>; rel="next"`}}
          : {json: [reply(1001), reply(1002)]});
      }
      assert.equal(url.searchParams.get('state'), 'all');
      assert.equal(url.searchParams.get('direction'), 'desc');
      if (mode === 'prs') return send({json: [issue(90, {pull_request: {}})], headers: {link: `<${api}?page=2>; rel="next"`}});
      if (number === 1) return send({json: [
        issue(3, {pull_request: {}}),
        issue(2, {comments: 2, title: '<img src=x onerror=alert(1)>', body_text: '<script>window.injected=true</script>\nhttps://example.com/' + 'x'.repeat(180)}),
        issue(1, {state: 'closed', locked: true, user: null}),
      ], headers: {link: `<${api}?page=2>; rel="next"`}});
      return send({json: [issue(4)]});
    });
    const status = page.locator('[data-guestbook-status]');
    const refresh = page.locator('[data-guestbook-refresh]');
    const ready = () => page.waitForFunction(() => !document.querySelector('[data-guestbook-refresh]').disabled);
    await page.goto(origin + '/guestbook/');
    await ready();
    assert.equal(await page.locator('.guestbook-entry').count(), 2);
    assert.equal(await page.locator('.guestbook-entry img,.guestbook-entry script').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(requests.filter(url => url.includes('/comments')).length, 0);
    assert.match(await page.locator('.guestbook-entry').last().innerText(), /已关闭.*|已删除的用户/s);
    await page.getByRole('button', {name: '查看回复（2）'}).click();
    await page.waitForFunction(() => document.querySelectorAll('.guestbook-reply').length === 1);
    replyMode = 'network';
    await page.getByRole('button', {name: '加载更多回复'}).click();
    await page.getByRole('button', {name: '重试加载回复'}).waitFor();
    assert.equal(await page.locator('.guestbook-reply').count(), 1);
    replyMode = 'normal';
    await page.getByRole('button', {name: '重试加载回复'}).click();
    await page.waitForFunction(() => document.querySelectorAll('.guestbook-reply').length === 2);
    assert.equal(await page.getByRole('button', {name: '加载更多回复'}).isVisible(), false);
    await page.getByRole('button', {name: '查看回复（2）'}).click();
    assert.equal(await page.locator('.guestbook-reply-panel').isVisible(), false);
    await page.screenshot({path: 'local-preview/guestbook-desktop.png', fullPage: true});
    await page.locator('[data-theme-toggle]').click();
    await page.screenshot({path: 'local-preview/guestbook-dark.png', fullPage: true});
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({width, height: 844});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390) await page.screenshot({path: 'local-preview/guestbook-mobile.png', fullPage: true});
    }
    await page.locator('[data-guestbook-next]').click();
    await ready();
    assert.equal(await page.locator('[data-guestbook-page]').innerText(), '第 2 页');
    assert.equal(await page.locator('[data-guestbook-next]').isDisabled(), true);
    mode = 'network';
    await page.locator('[data-guestbook-previous]').click();
    await ready();
    assert.equal(await page.locator('[data-guestbook-page]').innerText(), '第 2 页');
    assert.match(await status.innerText(), /保留上次/);
    assert.match(await page.locator('.guestbook-entry h3').innerText(), /游戏回忆 4/);
    for (const failure of ['limited', 'missing', 'invalid']) {
      mode = failure;
      await refresh.click(); await ready();
      assert.match(await status.innerText(), /重试|不可访问/);
      assert.equal(await page.locator('.guestbook-entry').count(), 1);
    }
    mode = 'empty';
    await refresh.click(); await ready();
    assert.match(await status.innerText(), /还没有留言/);
    assert.equal(await page.locator('.guestbook-entry').count(), 0);
    assert.equal(await page.locator('[data-guestbook-pagination]').isVisible(), false);
    mode = 'prs';
    await refresh.click(); await ready();
    assert.match(await status.innerText(), /略过代码合并请求/);
    assert.equal(await page.locator('[data-guestbook-next]').isEnabled(), true);
    mode = 'normal';
    await refresh.click(); await ready();
    assert.equal(await page.locator('.guestbook-entry').count(), 2);
    await page.clock.install();
    mode = 'timeout';
    await refresh.click();
    await page.clock.runFor(12500);
    await ready();
    assert.match(await status.innerText(), /超时/);
    assert.deepEqual(errors, []);
    const noJS = await browser.newPage({javaScriptEnabled: false});
    await noJS.goto(origin + '/guestbook/');
    assert.equal(await noJS.locator('noscript a').isVisible(), true);
    assert.equal(await noJS.locator('a[href$="/issues/new/choose"]').isVisible(), true);
    console.log('PASS: safe text, PR filtering, closed/deleted users, pagination, lazy replies, deduplication, retries, retained content, empty state, rate limit, 404, malformed response, timeout, responsive themes, no-JS fallback. No messages posted.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
