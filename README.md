# WestCreeper 的博客

西部苦力怕的个人博客与 Flash 游戏档案馆，运行在 GitHub Pages 上。

[访问博客](https://westcreeper.github.io/) · [发布与维护说明](PUBLISHING.md) · [项目结构](BLOG_ARCHITECTURE.md)

## 内容与功能

- Markdown 文章、分类筛选、全文搜索与 RSS。
- Flash 游戏档案、汉化资源下载与 Ruffle 在线播放器。
- 赞助名单、赞助留言与支付宝 / 微信赞助方式。
- GitHub Issues 留言与回复的站内展示、分页和刷新。
- 手机布局、深浅色切换、阅读目录。
- 游戏收藏与最近 60 款游玩记录（当前浏览器保存），可与搜索、标签和排序组合使用。
- 档案馆统计：收录总数、汉化／原版数量、标签数量，支持减少动态效果。
- 游戏存档导入／导出：备份 Ruffle 已保存的 SOL 数据为本站 JSON 文件，导入前预览、校验并确认覆盖；共享位置默认不选中。不支持即时存档或账号云存档。

游戏能否完整运行取决于原文件和模拟器兼容性；已知问题会在游戏档案中标注。

## 本地预览

使用 Ruby 3.3 和 Bundler；Windows 请安装包含 Devkit 的 RubyInstaller。

```sh
bundle install
bundle exec jekyll serve
```

按终端提示访问本地地址。本站使用普通 Jekyll 项目结构，不需要安装 Node.js 或构建主题 gem。

## 构建与检查

```sh
bundle exec jekyll build
python tools/check-site.py _site
```

GitHub Actions 会在推送到 `master` 后自动构建、检查和部署。首次部署需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

新增文章、游戏和配置播放器的具体方法见 [PUBLISHING.md](PUBLISHING.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `_posts/` | 文章 Markdown |
| `_data/games.yml` | 游戏目录与兼容提示 |
| `_data/sponsors.json` | 赞助昵称、日期、金额与留言 |
| `swf/` | 游戏文件、封面、详情和资源页面 |
| `_layouts/`、`_includes/studio/` | 当前博客布局与公共组件 |
| `assets/` | 当前界面的样式、脚本、头像与插画 |
| `.github/workflows/jekyll.yml` | GitHub Pages 自动部署 |
| `tools/check-site.py` | 构建结果的链接和索引检查 |

当前界面使用 `assets/images/cactus.svg`。根目录保留 `favicon.ico` 和 `apple-touch-icon.png`，供浏览器自动发现；未接入页面的旧磁贴、Safari 固定标签图标、Android 图标与空清单已移除。

本地工作环境、截图、备份与预览产物已移至仓库同级的 `../westcreeper-workspace/`。`_site/`、`.jekyll-cache/`、`local-preview/` 仍保留忽略规则，防止默认构建命令意外提交生成文件。

## 界面动效

`assets/js/motion.js` 与 `assets/css/motion.css` 提供滚动入场、首页插画的立体跟随、卡片光晕及导航和按钮反馈，合计约 9 KB（未压缩）。使用原生浏览器功能，无第三方动画库、轮询、远程接口或常驻动画循环；卡片跟随只在鼠标移动时更新，入场仅播放一次。手机不启用鼠标跟随，系统开启“减少动态效果”时停用动效，脚本不可用时内容依然可见。Flash 播放器及虚拟按键不参与这些动画。

## 界面图标

`assets/images/ui-icons.svg` 包含 34 个原创的 16 × 16 网格图标，参考 re-ocd 的方块轮廓、内嵌边框与有限色阶，未复制材质包纹理。导航、搜索、文章、游戏卡片、档案馆统计、收藏、播放器及存档工具共用此 SVG 精灵图；约 7 KB，浏览器可缓存，无图标字体或第三方请求。

使用 `{% include studio/icon.html name='archive' %}` 引入图标，名称对应 SVG 中的 `symbol id`。`assets/css/icons.css` 统一尺寸与明暗主题配色。装饰图标对读屏隐藏，按钮保留文字或可访问名称；动态按钮通过 `data-icon-label` 更新文字，避免清除图标。

## 来源与许可

本站最初基于 [TeXt Theme](https://github.com/kitian616/jekyll-TeXt-theme) 创建，现已使用独立的博客布局，并清理上游模板的示例、截图及主题开发文件。原模板的版权与 MIT 许可声明保留在 [LICENSE](LICENSE)。文章许可说明见各文章页；游戏及其他素材的权利归各自作者所有。

收藏与历史保存在 `wc-game-library-v1`，不上传服务器；仅成功加载的游戏会计入最近玩过，最多保留 60 款。游戏存档与收藏记录分开管理。存档备份支持在不同设备的本站同一游戏中恢复，资源域名与路径需保持一致；暂不接收第三方 `.sol` / `.zip` 文件。读取规则对应固定版本 Ruffle 0.6.0 的本地 SharedObject 格式，升级模拟器时应复核。可运行 `node tools/check-game-features.cjs` 检查存储隔离、无效备份拒绝和失败回滚。

## 赞助入口与首页插画

首页、文章目录、游戏档案馆和关于页显示右下角赞助入口，跳转至现有赞助页面。正文、游戏详情、赞助页和其他工具页面不加载该组件；打开搜索或手机导航时暂时隐藏。点击关闭按钮后，可选择是否勾选「7 天内不再显示」；默认不勾选，仅收起当前页面，下次进入或刷新会再次显示。勾选后，关闭记录 `wc-sponsor-dismissed-until` 保存在当前浏览器，7 天内不再显示，并同步至同源的其他标签页；禁用存储时仍可关闭当前页入口。导航中的赞助名单始终保留。

组件位于 `_includes/studio/sponsor-entry.html`，显示页面由 `_layouts/studio.html` 的 `show_sponsor_entry` 控制。`sponsor-entry.css` / `sponsor-entry.js` 仅在这些页面加载。入口只有一次入场与悬停反馈，尊重系统减少动态效果设置，不轮询、不向第三方发请求。

首页 `assets/images/desktop.svg` 与入口 `assets/images/sponsor-cactus.svg` 为原创方块 SVG，参考 re-ocd 的有限色阶、层叠边框与像素轮廓；首页插画文字也由路径绘制，不依赖外部字体。

## 手机悬浮触控

在游戏页打开「虚拟键盘」，选择方向键、WASD 或自定义布局，以及十字键／八向摇杆，然后点击「悬浮触控」。该模式进入沉浸画面，把原有控件放在左下和右下，取消下方按键区域的占位。左上角随时隐藏／显示按键，右上角解锁并恢复进入前的布局。完整键盘仍使用原有下方布局。

触控层只有摇杆与按钮接收点击，其他区域穿透到 Ruffle；隐藏、退出、窗口尺寸改变、失焦时释放按键，避免卡键。透明背景保留游戏画面可见性，未增加网络请求、定时轮询或额外动画。仅按住实体映射键时沿用原有键盘重复事件。

样式在 `assets/css/player-touch.css`，交互复用 `assets/js/player-controls.js`。运行 `node tools/check-player-controls.cjs` 可检查斜向与动作键同时按下、隐藏释放、旧触点失效、旋转释放、退出恢复及完整键盘限制。点击穿透依据 [MDN pointer-events](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/pointer-events) 的父层禁用、控件单独启用规则。
