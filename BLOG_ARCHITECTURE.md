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
| `/games.json` | 游戏卡片数据，不含 SWF 本体 |
| `/feed.xml` | Atom 订阅 |

文章沿用 Jekyll 的日期 URL，页面入口由 front matter 中的 `permalink` 决定。

## 布局与数据

- `_layouts/studio.html`：公共页面外壳、导航、搜索弹窗、主题切换。
- `_layouts/article.html` → `reading.html` → `studio.html`：文章正文、目录与相邻文章导航。
- `_layouts/simple.html` → `studio.html`：关于、资源、留言等文字页面。
- `_layouts/game.html` → `studio.html`：游戏元数据、Ruffle、兼容提示与下载。
- `_includes/studio/`：卡片、筛选栏和 SVG 图标。
- `_data/games.yml`：首页、档案馆和搜索索引共用的游戏资料。

- `_data/sponsors.json`：赞助记录（昵称、日期、金额、留言），由 `sponsors.html` 按日期倒序、年份分组展示。
- `_data/storage.yml`：R2 公开资源域名；不存储密钥。游戏的 `swf_key` 通过 `_includes/studio/media-url.html` 解析，兼容原有站内 SWF 和完整 HTTPS 地址。
- `assets/images/sponsor-payment.png`：支付宝与微信赞助方式原图。

## 浏览器资源

样式和交互来自 `assets/css/studio.css`、`assets/js/studio.js`。游戏页额外加载 `assets/js/ruffle-loader.js`，点击开始后才请求固定版本的 Ruffle。

首页、游戏详情页和档案馆通过 `_includes/studio/game-collection.html` 与 `assets/js/game-collection.js` 读取 `games.json`。首页与详情页随机取 3 部（详情页排除当前游戏），档案馆每页 12 部；只为当前结果创建卡片与封面。分类、关键词及页码使用 `tag`、`q`、`page` 查询参数，支持历史导航。关闭 JavaScript 时提供有限数量的静态卡片。

留言页额外加载 `assets/js/guestbook.js`，从公开 GitHub Issues API 读取留言及回复，支持分页和重试。正文以纯文本显示，写入和管理均在 GitHub 完成。

没有站内管理后台和数据库。文章发布通过更新 `_posts/` 完成，留言通过 GitHub Issues 收集。

## 构建

`Gemfile` 直接声明 Jekyll、Feed、Sitemap 和 Windows 时区数据，不再依赖原 TeXt 主题的 gemspec、npm、Docker 或 Travis 配置。未使用的旧布局别名与 Jemoji 插件已移除，直接输入的 Unicode 表情不受影响。

部署工作流在上传站点前执行 `tools/check-site.py`，检查站内链接、资源路径和搜索索引。具体操作见 [PUBLISHING.md](PUBLISHING.md)。
