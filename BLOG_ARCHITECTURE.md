# 博客结构

本站是独立的 Jekyll 静态站点，由 GitHub Actions 构建并发布到 GitHub Pages。

## 页面入口

| 路径 | 内容 |
| --- | --- |
| `/` | 首页 |
| `/archive.html` | 文章归档与筛选 |
| `/swf/` | 游戏档案馆 |
| `/swf/games/<id>/` | 游戏详情与播放器 |
| `/sponsors/` | 赞助名单、留言与赞助方式 |
| `/releases/` | 旧地址，自动跳转至赞助名单 |
| `/resources/` | 工具与资源 |
| `/guestbook/` | GitHub Issues 留言列表、回复与写入入口 |
| `/friends/` | 友情链接 |
| `/about.html` | 关于我 |
| `/search.json` | 全站静态搜索索引 |
| `/feed.xml` | Atom 订阅 |

文章沿用 Jekyll 的日期 URL，页面入口由 front matter 中的 `permalink` 决定。

## 布局与数据

- `_layouts/studio.html`：公共页面外壳、导航、搜索弹窗、主题切换。
- `_layouts/article.html` → `reading.html` → `studio.html`：文章正文、目录与相邻文章导航。
- `_layouts/simple.html` → `studio.html`：关于、资源、留言等文字页面。
- `_layouts/page.html`：`simple.html` 的兼容别名。
- `_layouts/game.html` → `studio.html`：游戏元数据、Ruffle、兼容提示与下载。
- `_includes/studio/`：卡片、筛选栏和 SVG 图标。
- `_data/games.yml`：首页、档案馆和搜索索引共用的游戏资料。

- `_data/sponsors.json`：赞助记录（昵称、日期、金额、留言），由 `sponsors.html` 按日期倒序、年份分组展示。
- `assets/images/sponsor-payment.png`：支付宝与微信赞助方式原图。

## 浏览器资源

样式和交互来自 `assets/css/studio.css`、`assets/js/studio.js`。游戏页额外加载 `assets/js/ruffle-loader.js`，点击开始后才请求固定版本的 Ruffle。

留言页额外加载 `assets/js/guestbook.js`，从公开 GitHub Issues API 读取留言及回复，支持分页和重试。正文以纯文本显示，写入和管理均在 GitHub 完成。

没有站内管理后台和数据库。文章发布通过更新 `_posts/` 完成，留言通过 GitHub Issues 收集。

## 构建

`Gemfile` 直接声明 Jekyll、Feed、Sitemap、Jemoji 和 Windows 时区数据，不再依赖原 TeXt 主题的 gemspec、npm、Docker 或 Travis 配置。

部署工作流在上传站点前执行 `tools/check-site.py`，检查站内链接、资源路径和搜索索引。具体操作见 [PUBLISHING.md](PUBLISHING.md)。
