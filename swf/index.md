---
layout: studio
title: 游戏档案馆
permalink: /swf/
---
<div class="container collection-page" data-filter-list>
  <header class="page-intro"><div class="eyebrow">THE FLASH COLLECTION</div><h1>好游戏，值得再玩一次。</h1><p>这里收藏着我喜欢的 Flash 游戏与汉化作品。那些曾经点亮课余时光的小小世界，现在依然可以打开。</p></header>
  {% include studio/filters.html type='games' %}
  <div class="game-grid">{% for game in site.data.games %}{% include studio/game-card.html game=game filterable=true %}{% endfor %}</div>
  <div class="empty-state" data-filter-empty hidden>没有找到这款游戏，换个关键词或分类试试。</div>
  <div class="collection-help"><h2>游玩小贴士</h2><p>点击游戏进入详情页，再按「开始游戏」加载。无需安装 Flash 插件，建议使用电脑和键盘游玩。首次加载可能需要一些时间；若模拟器无法运行某款游戏，可以下载 SWF 文件使用本地播放器打开。<a href="{{ '/guestbook/' | relative_url }}">反馈游戏问题 ↗</a></p></div>
</div>
