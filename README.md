# WestCreeper 的博客

西部苦力怕的个人博客与 Flash 游戏档案馆，运行在 GitHub Pages 上。

[访问博客](https://westcreeper.github.io/) · [发布与维护说明](PUBLISHING.md) · [项目结构](BLOG_ARCHITECTURE.md)

## 内容与功能

- Markdown 文章、分类筛选、全文搜索与 RSS。
- Flash 游戏档案、汉化资源下载与 Ruffle 在线播放器。
- 赞助名单、赞助留言与支付宝 / 微信赞助方式。
- GitHub Issues 留言与回复的站内展示、分页和刷新。
- 手机布局、深浅色切换、阅读目录。

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

## 来源与许可

本站最初基于 [TeXt Theme](https://github.com/kitian616/jekyll-TeXt-theme) 创建，现已使用独立的博客布局，并清理上游模板的示例、截图及主题开发文件。原模板的版权与 MIT 许可声明保留在 [LICENSE](LICENSE)。文章许可说明见各文章页；游戏及其他素材的权利归各自作者所有。
