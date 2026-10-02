---
layout: studio
title: 留言板
permalink: /guestbook/
description: 提一个建议，寻找一部记忆中的游戏，聊聊属于你的 Flash 回忆。
---
<div class="container collection-page guestbook-page">
  <header class="page-intro"><div class="eyebrow">EVERY GAME HAS A STORY</div><h1>留言板</h1><p>提一个建议，找一部记忆中的游戏，或聊聊属于你的 Flash 回忆。</p></header>
  {% include studio/community.html scope='board' feed='all' title='来自大家的声音' description='汇集游戏评论、寻找游戏、问题建议与闲聊交流。选择分类查看，展开留言参与回复。填写昵称即可发言，主帖和回复均在审核通过后展示。' %}
  <aside class="guestbook-welcome"><h2>以前的留言，还在这里</h2><p>旧留言与回复保留在 GitHub。新的留言与回复请使用上方表单。GitHub 上的内容直接公开，不经过本站的发布前审核。</p><a class="button" href="https://github.com/{{ site.repository | escape }}/issues" target="_blank" rel="noopener noreferrer">查看 GitHub 历史留言 {% include studio/icon.html name='external' %}</a></aside>
  {% unless site.data.community.enabled %}
  <section data-guestbook data-repository="{{ site.repository | escape }}" aria-label="GitHub 历史留言">
    <template data-guestbook-link-icon>{% include studio/icon.html name='external' %}</template>
    <div class="section-heading"><h2>GitHub 历史留言</h2><button class="button" type="button" data-guestbook-refresh hidden>刷新历史留言</button></div>
    <p data-guestbook-status role="status" aria-live="polite">正在读取旧留言…</p><div class="guestbook-entries" data-guestbook-entries aria-busy="false"></div>
    <nav class="guestbook-pagination" data-guestbook-pagination aria-label="历史留言分页" hidden><button class="button" type="button" data-guestbook-previous>上一页</button><span data-guestbook-page></span><button class="button" type="button" data-guestbook-next>下一页</button></nav>
  </section><script src="{{ '/assets/js/guestbook.js' | relative_url }}" defer></script>
  {% endunless %}
</div>
