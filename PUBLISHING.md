# 博客维护与发布

本站仍是 Jekyll 静态站点，保留 GitHub Pages 和现有文章地址，不需要数据库。首页与目录由 Markdown 和 YAML 自动生成，发布操作在仓库中完成。

`Gemfile` 直接声明站点使用的依赖；原 TeXt 模板的示例、截图、旧组件、主题打包和开发脚本已清理。项目目录说明见 [README.md](README.md) 与 [BLOG_ARCHITECTURE.md](BLOG_ARCHITECTURE.md)。

## 发布文章

在 `_posts/` 新建 `YYYY-MM-DD-标题.md`：

```yaml
---
layout: article
title: 文章标题
tags: [漫谈Flash]
description: 一两句话介绍这篇文章，用于首页摘要与搜索结果。
---

正文使用 Markdown。

## 一个小节

继续书写……
```

可使用已有的 `漫谈Flash`、`随感` 标签，也可添加新标签。目录筛选会自动更新。正文中的标题会生成文章目录。标题、摘要与正文都进入全站搜索，文章列表的搜索则匹配标题和摘要。图片建议放入 `assets/images/posts/`，使用 `{{ '/assets/images/posts/example.jpg' | relative_url }}` 引用。

## 添加游戏

1. 在 `swf/games/游戏标识/` 放入 `.swf` 文件、缩略图和 `index.md`。
2. 在 `_data/games.yml` 中添加一条记录。路径大小写须与真实文件一致。

```yaml
- id: example
  title: 游戏中文名
  original_title: Original Game Title
  category: 益智解谜
  language: 汉化版
  translated: true
  author: 原作者
  swf: /swf/games/example/game.swf
  cover: /swf/games/example/thumbnail.jpg
  source: https://example.com/original-game
  description: 一句简洁的游戏介绍。
```

游戏的 `index.md`：

```yaml
---
layout: game
title: 游戏中文名
game_id: example
permalink: /swf/games/example/
---

## 游戏介绍

在这里介绍游戏。

## 操作说明

- 方向键：移动
```

`translated: true` 表示汉化版本，游戏卡片和详情使用 `language` 展示语言；原版请填写 `false` 和 `language: 原版`。不要将未验证的版本标记成汉化。新增游戏上线前，需实测菜单、字体、音频和主要关卡；播放器加载成功不代表所有游戏功能兼容。

## 播放器

采用固定版本 Ruffle 0.6.0，点击「开始游戏」后才下载模拟器，避免首页加载大型 WASM。优先使用 jsDelivr，失败时尝试同版本 unpkg。模拟器依赖外部网络；SWF 与封面由本站托管。需要离线或减少 CDN 依赖时，可将官方 Web 自托管包完整放入 `assets/ruffle/`，并修改 `_layouts/game.html` 的 `data-ruffle-src` 与 `assets/js/ruffle-loader.js` 的备用地址。不要只复制 `ruffle.js`，其配套 WASM 和 JS 块也必须存在。

参考：[Ruffle 官方文档](https://ruffle.rs/js-docs/master/interfaces/Player.PlayerV1.html)。默认关闭 SWF 对页面的脚本访问，原作外链由模拟器确认后打开。全屏、重开和下载均位于播放器下方。多数原作需要电脑键盘，移动端采用响应式布局，不伪造触屏控制。

已知限制：当前《大劫案 2》文件在本地启动后显示 AddictingGames 原站限制。因此已通过 `play_status` 和 `play_note` 在卡片、详情页标明，不将文件成功加载视为可玩证明。更换为可在本站运行的合法授权版本并实测后，再修改这两个字段。其他游戏若出现兼容问题，也可用相同字段说明。

## 本地构建与 GitHub Pages

安装 Ruby 3.3 与 Bundler 后，在仓库目录运行（Windows 使用带 Devkit 的 RubyInstaller）：

```sh
bundle install
bundle exec jekyll serve
```

访问终端提示的本地地址。正式构建：

```sh
bundle exec jekyll build
```

构建后可运行 `python tools/check-site.py _site`，检查搜索索引以及页面内的站内链接、封面和 SWF 路径。

项目子路径可用 `bundle exec jekyll build --baseurl /preview` 验证。新增页面链接、封面与 SWF 引用都应使用 `relative_url`。

仓库现有 `.github/workflows/jekyll.yml` 监听 `master` 分支推送，使用 Ruby 3.3 构建，并在上传前检查站内链接及搜索索引。GitHub 仓库的 Settings → Pages → Build and deployment 应选择 GitHub Actions。将改动提交并推送至 `master` 后，由该工作流构建和发布。本次界面修改本身不执行推送。

## 界面与交流

- 公共布局：`_layouts/studio.html`；样式：`assets/css/studio.css`。
- 首页：`index.html`；文章归档：`archive.html`；游戏数据：`_data/games.yml`。
- 配色支持浅色、深色与首次访问时跟随系统，手动选择保存在本地浏览器。
- 全站搜索支持 `Ctrl/Cmd + K`，使用静态 `search.json`，不调用搜索服务。
- 首页每次访问随机展示 3 部游戏，详情页随机推荐 3 部其他游戏，不足 3 部时展示全部候选。档案馆每页 12 部，分类和搜索覆盖全部游戏，筛选变化时回到第一页；页码与筛选条件保存在网址中，支持刷新和浏览器前进 / 后退。
- 游戏列表读取轻量的 `games.json`，只创建当前页或随机选中的卡片，并按需加载封面；不会一次性渲染全部卡片。分页大小由 `swf/index.md` 中的 `limit=12` 控制。
- 留言板通过 GitHub Issues 收集留言，并在站内读取、展示公开留言与回复。具体行为见下方说明。
- 已有文章正文及外部图片地址保留，外部图片可用性仍取决于原托管站点。

## 留言板维护

- `swf/guestbook.md` 是留言板页面，`assets/js/guestbook.js` 负责读取公开 GitHub REST API。仓库由 `_config.yml` 的 `repository` 指定，必须公开并启用 Issues。
- 「写留言」打开 GitHub 的 Issue 模板选择页；「在 GitHub 回复」打开对应 Issue。写入需要用户在 GitHub 登录，博客不保存登录凭据，也不需要配置 Token、OAuth 或评论应用。
- 每页请求 20 条记录，按创建时间倒序，包含开放和已关闭的 Issues，过滤 Pull Request。因此包含 Pull Request 的页面可能少于 20 条留言。使用上一页 / 下一页浏览。
- 回复展开时才请求，每批 20 条；可加载更多。关闭 Issue 不会隐藏留言；不适合公开的内容需要在 GitHub 删除或编辑。所有公开 Issues 都会展示，未按标签筛选。
- 正文使用 GitHub 提供的纯文本，安全地写入 DOM；不执行留言 HTML。图片、Markdown 排版及附件请通过原帖链接查看。
- 页面打开及手动刷新时读取最新内容，不轮询。发言后回到博客点击「刷新留言」。网络超时、访问限制和不可访问状态均提示重试；刷新或翻页失败时保留上次成功加载的内容。
- 未登录的 API 请求受到 GitHub 的访问频率限制，共用出口网络的访客可能共享额度。不要把私有 Token 写进前端代码；受限时可直接在 GitHub 查看。关闭 JavaScript 时仍可使用 GitHub 入口。
- 本地回归脚本：安装 Playwright 后运行 `node tools/test-guestbook.cjs`，通过 `PLAYWRIGHT_MODULE` 和 `BROWSER_EXECUTABLE` 指定现有运行时与浏览器，`BLOG_PREVIEW_URL` 可覆盖默认的 `http://127.0.0.1:4000`。测试使用模拟响应，不会创建公开留言。截图默认写入系统临时目录，可用 `BLOG_TEST_OUTPUT` 指定仓库外的输出目录。

参考：[GitHub Issues API](https://docs.github.com/en/rest/issues/issues#list-repository-issues)、[回复 API](https://docs.github.com/en/rest/issues/comments#list-issue-comments)、[访问频率限制](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)。

## 更新赞助名单

赞助页面为 `/sponsors/`，入口文件是 `sponsors.html`。原 `/releases/` 地址会自动跳转到这里。游戏的在线游玩与 SWF 下载仍在各自的游戏详情页。

编辑 `_data/sponsors.json`，为每笔赞助添加一条记录。首次数据来自提供的「赞助名单.xlsx」Sheet1，保留原有昵称（包括星号匿名）、日期、金额与留言，不合并同名记录。

```json
{
  "name": "展示昵称",
  "date": "2026-09-10",
  "amount": "5.00",
  "message": "留言内容，没有则填空字符串"
}
```

日期使用 `YYYY-MM-DD`；金额使用保留两位小数的字符串，避免显示精度变化。记录之间用逗号分隔，页面会自动按日期倒序、年份分组，更新记录数。不需要手工调整页面顺序。

替换 `assets/images/sponsor-payment.png` 可以更新赞助方式。保持两个收款码完整清晰；当前原图为 2160 × 1080，若更换尺寸，请同步修改页面中图片的 `width`、`height`。原始 Excel 不会作为公开下载文件发布。

## 本地可视化编辑器与 R2

编辑器位于仓库外的 `../westcreeper-workspace/editor/`，双击上一级目录的「打开博客编辑器.cmd」启动。浏览器访问 `http://127.0.0.1:4173`，载入博客根目录后即可管理文章、游戏和赞助名单。编辑器仅监听本机，保存前自动备份到它的 `state/backups/`，不会自动提交或推送。

- 文章：支持标题、标签、草稿、Markdown 编辑与预览、插入本地图片。已有文章保留文件名和日期，未编辑的 YAML 字段也会保留。
- 游戏：支持档案元数据、封面、操作说明、兼容提示、外部 SWF 地址或 R2 对象路径。
- 赞助：按条目新增、修改和删除，自动格式化两位小数，保留匿名昵称和留言。
- R2：支持文件夹、ZIP 或单文件扫描，核对清单后上传；保留目录结构，比较文件大小及 SHA-256 元数据，相同文件跳过，不同文件默认拒绝覆盖。上传记录在编辑器 `state/transfers/`。密钥仅存于当前进程内存，退出后需要重新填写。
- 已上传资源支持「全部 / 未建档的游戏 / 已建档的游戏 / 配套文件」筛选，以及文件名、对象路径、游戏名称搜索。按照当前载入博客的 SWF 地址或 R2 对象路径识别关联；已建档资源可直接编辑档案，保存或移除档案后自动更新筛选结果。外部程序改动档案后，点击「重新载入」同步。

R2 的公开域名保存在 `_data/storage.yml` 的 `public_base_url`，不要在仓库里保存密钥。游戏条目可使用：

```yaml
swf_key: games/flash-cn/My_Game_CN.swf
swf: /swf/games/my-game/old-local-copy.swf
```

公开域名配置完成时使用 `公开域名 + swf_key`，未配置时使用 `swf` 后备地址。也可以只给 `swf` 填完整 HTTPS 地址。播放器以 SWF 所在目录解析相对资源，因此 TXT、XML、音频等配套文件必须维持原有相对位置。内含 7z 的资源应先解压为 SWF 和配套文件才能在线游玩；7z 本身仅用于下载。

R2 控制台步骤、CORS 配置与编辑器使用方法见仓库外的 `../westcreeper-workspace/editor/README.md`。R2 账号尚未开通时，编辑器的内容管理仍可使用，上传不能执行。只有经过公开访问与浏览器游玩验证的游戏才能删掉仓库里的旧 SWF；当前已有三个游戏的本地文件继续保留。

GitHub Pages 发布站点有 1 GB 上限，构建检查会拒绝超过上限的输出。大批游戏资源请始终保留在仓库外并上传到 R2。

参考：[Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[R2 公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)。

## 将本地预览产物放在仓库外

本工作区的预览运行时与临时文件位于仓库同级的 `../westcreeper-workspace/`。可运行该目录中的 `preview.ps1` 构建；它将站点输出、Jekyll 缓存、Bundler 锁文件和测试截图都放在工作目录中。

使用自己安装的 Ruby 时，也可以在仓库中运行：

```sh
bundle exec jekyll build --destination ../westcreeper-workspace/site --disable-disk-cache
```

文章、游戏、赞助数据、页面代码与回归测试仍属于仓库源码；预览产物和运行时不需要提交。根目录原有 `.gitignore` 规则继续防止默认命令产生的临时文件被加入版本控制。
