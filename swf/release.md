---
layout: studio
title: 汉化发布
permalink: /releases/
---
<div class="container collection-page"><header class="page-intro"><div class="eyebrow">LOST IN TRANSLATION, FOUND IN PLAY</div><h1>让好游戏，跨过语言的边界。</h1><p>这里集中收录本站已有的 Flash 汉化作品。可以直接在线游玩，也可以下载 SWF 文件留一份自己的存档。</p></header>
{% for game in site.data.games %}{% if game.translated %}<article class="release-card"><img src="{{ game.cover | relative_url }}" alt="{{ game.title }}游戏画面" width="90" height="90"><div><div class="eyebrow">{{ game.original_title }}</div><h2>{{ game.title }} · 汉化版</h2><p>{{ game.description }}</p>{% if game.play_note %}<p>{{ game.play_status }} · 详情见游戏档案</p>{% endif %}</div><div class="release-actions"><a class="button button-primary" href="{{ '/swf/games/' | append: game.id | append: '/' | relative_url }}">{% if game.play_note %}查看档案 ↗{% else %}在线游玩 ↗{% endif %}</a><a class="button" href="{{ game.swf | relative_url }}" download>下载 SWF ↓</a></div></article>{% endif %}{% endfor %}
<div class="collection-help"><h2>关于汉化与反馈</h2><p>汉化文件对应本站现有收录版本；原作版权归各自开发者所有。如果遇到文字、显示或运行问题，请附上游戏名称与问题描述，前往<a href="{{ '/guestbook/' | relative_url }}">留言板反馈</a>。</p></div></div>
