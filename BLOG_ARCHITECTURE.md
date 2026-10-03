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
| `/guestbook/` | 统一留言板：文章评论、游戏评论、寻游、问题建议与闲聊 |
| `/my-cookie/` | 饼干个人中心：身份设置、私人留言记录与参与的公开讨论 |
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

播放器工具栏由 `_includes/studio/player-controls.html` 和 `assets/js/player-controls.js` 提供，包括手机指南、可重新映射的虚拟键盘、网页内全屏、屏幕全屏、画面尺寸与音量。加载器通过 `player-loading`、`player-ready`、`player-failed` 事件同步按键可用状态；键位按游戏保存在访客浏览器，音量为浏览器内共用偏好。切换视图不会重建播放器，重新开始仍需确认。

首页、游戏详情页和档案馆通过 `_includes/studio/game-collection.html` 与 `assets/js/game-collection.js` 读取 `games.json`。首页与详情页随机取 3 部（详情页排除当前游戏），档案馆每页 12 部；只为当前结果创建卡片与封面。分类、关键词及页码使用 `tag`、`q`、`page` 查询参数，支持历史导航。关闭 JavaScript 时提供有限数量的静态卡片。

留言板仅使用 Cloudflare 社区系统，通过顶部导航进入；页脚不重复放置入口。旧 GitHub Issues 读取接口、历史链接及旧版脚本已移除，社区停用时仅显示暂未开放提示。

评论与讨论版的新服务位于 `tools/community/`（不发布到 GitHub Pages）：Cloudflare Worker + D1 + Turnstile，Access 保护审核台。`_data/community.yml` 控制启用状态、公开 API 地址和 Turnstile 公钥，当前已启用。留言板进入时读取全部分类的已公开主帖，支持分类筛选及展开回复；每个游戏通过 `studio/community.html` 接入独立讨论；主帖和回复先审核后公开。后台组合筛选、编辑和逻辑删除均受 Access 验证保护；revision 防止旧页面覆盖更改，操作保留审计记录。上线步骤和实现边界见 [评论服务说明](tools/community/README.md)。文章发布仍通过更新 `_posts/` 完成。

## 构建

`Gemfile` 直接声明 Jekyll、Feed、Sitemap 和 Windows 时区数据，不再依赖原 TeXt 主题的 gemspec、npm、Docker 或 Travis 配置。未使用的旧布局别名与 Jemoji 插件已移除，直接输入的 Unicode 表情不受影响。

部署工作流在上传站点前执行 `tools/check-site.py`，检查站内链接、资源路径和搜索索引。具体操作见 [PUBLISHING.md](PUBLISHING.md)。

## 饼干个人中心

`my-cookie.html` 使用 `studio/cookie-panel.html` 与 `identity.js` 集中处理领取、恢复码登录、头像、改名、恢复码重置及退出。`cookie-center.js` 分页读取自己的留言与参与讨论；未审核内容只能由对应饼干的有效会话读取。个人记录不写入本地存储，退出、切换身份和离开页面时清空。

文章、游戏和留言板使用 `cookie-session.js` 只显示登录摘要和前往个人中心的链接；头像渲染仍由根元素上的头像清单提供，不再依赖内嵌头像设置。登录返回地址仅接受本站路径，保存新恢复码前阻止返回。`wc-cookie-changed` 仅广播变化时间，不保存凭据或个人记录。验证码加载由 `community-auth.js` 共用。
