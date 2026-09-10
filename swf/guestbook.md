---
layout: studio
title: 留言板
permalink: /guestbook/
description: 留下一个想法，聊聊一款游戏。
---
<div class="container collection-page guestbook-page" data-guestbook data-repository="{{ site.repository | escape }}">
  <header class="page-intro">
    <div class="eyebrow">LET'S TALK ABOUT THE GAMES WE LOVE</div>
    <h1>留言板</h1>
    <p>交流游戏、反馈汉化问题、分享补档线索，或是留下一段你的游戏回忆。</p>
  </header>
  <section class="guestbook-welcome" aria-labelledby="guestbook-welcome-title">
    <h2 id="guestbook-welcome-title">有什么想聊的？</h2>
    <p>点击「写留言」，登录 GitHub 后提交。公开的留言和回复会在这里展示；提交后返回本页，点击「刷新留言」即可查看。</p>
    <div class="guestbook-actions">
      <a class="button button-primary" href="https://github.com/{{ site.repository | escape }}/issues/new/choose" target="_blank" rel="noopener">写留言 ↗</a>
      <a class="button" href="https://github.com/{{ site.repository | escape }}/issues" target="_blank" rel="noopener">在 GitHub 查看 ↗</a>
    </div>
    <details class="guestbook-guide"><summary>反馈问题或申请友链时，可以写些什么？</summary><p>游戏问题请附游戏名称、页面地址、浏览器与设备、重现步骤，以及错误提示或截图。申请友链请附网站名称、地址、简介和头像链接。</p></details>
    <p class="guestbook-privacy">留言会同时公开在 GitHub 和博客，请勿填写私密信息。</p>
  </section>
  <section class="guestbook-messages" aria-labelledby="guestbook-messages-title">
    <div class="section-heading"><div><div class="eyebrow">来自大家的声音</div><h2 id="guestbook-messages-title">留言与交流</h2></div><button class="button" type="button" data-guestbook-refresh hidden>刷新留言</button></div>
    <p class="guestbook-status" data-guestbook-status role="status" aria-live="polite">留言由 GitHub 提供。</p>
    <noscript><p>启用 JavaScript 后可在这里查看留言，或直接<a href="https://github.com/{{ site.repository | escape }}/issues">前往 GitHub 查看与交流</a>。</p></noscript>
    <div class="guestbook-entries" data-guestbook-entries aria-busy="false"></div>
    <nav class="guestbook-pagination" data-guestbook-pagination aria-label="留言分页" hidden>
      <button class="button" type="button" data-guestbook-previous>上一页</button><span data-guestbook-page></span><button class="button" type="button" data-guestbook-next>下一页</button>
    </nav>
    <p class="guestbook-footnote">按发表时间从新到旧展示，包括已关闭的留言。正文以纯文本展示，图片与完整排版可在 GitHub 查看。</p>
  </section>
</div>
<script src="{{ '/assets/js/guestbook.js' | relative_url }}" defer></script>
