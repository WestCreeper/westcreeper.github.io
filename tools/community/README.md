# 评论与讨论版：实现及 Cloudflare 上线说明

更新：2026-10-02。当前状态：统一留言板与后台管理代码已完成，已在站长创建的 D1 数据库 `westcreeper_blog` 执行初始迁移及 `0002_management.sql` 增量迁移。Worker 已部署并绑定该 D1，线上读取、未授权后台拒绝访问和暂停投稿检查通过；Turnstile 已创建，公钥已写入博客且私钥已保存为 Worker Secret；Access 团队、应用 AUD 与管理员邮箱已部署，管理员已通过截图确认真实登录及空队列读取正常。服务端投稿与本地博客开关已开启；正式博客原有评论入口已发布；本次统一留言板前端与顶部导航待推送仓库发布。新版 Worker 与审核后台已部署。仍需完成一次真实投稿、通过、隐藏的验收。

服务地址：`https://westcreeper-community.xiaoshuochyo.workers.dev`。当前版本：`cb55a71a-ee1d-4094-a420-67823e58d101`。部署配置 `wrangler.jsonc` 保存在本机并已忽略提交。已修复静态资源将后台首页重定向到根目录的问题；回归测试包含后台首页的三个入口。管理员实际登录已于 2026-10-01 由站长截图确认。

## 研究结论

原版留言板（旧脚本现已移除）直接读取公开 GitHub Issues，排除 PR，但没有按审核标签过滤，并同时展示打开和关闭的 Issue。关闭 Issue 不等于隐藏；即使在博客侧过滤，内容仍已在 GitHub 公开。因此它不适合作为“先审核后公开”的存储端。

新方案使用 GitHub Pages 展示页面，Cloudflare Worker 处理投稿与读取，D1 保存内容和审核记录，Turnstile 减少机器人投稿，Access 保护审核后台。R2 继续承载 SWF；第一版评论不需要 R2，不向公开游戏桶写入待审核内容。以后如加入图片附件，需单独设计私有上传、审核及公开流程。

## 已实现的交互

- 所有采用 `game` 布局的游戏页自动加入评论区，以 `game:<game_id>` 关联，改显示名称不影响评论。评论位于播放器外，不进入沉浸模式。
- `/guestbook/` 保留原地址，作为“留言板”汇总所有已公开的主帖，回复按主帖展开；顶部导航可直接进入。支持全部留言、游戏评论区、寻找游戏、问题建议、闲聊交流分类。游戏留言显示对应游戏名称与返回链接。寻游和反馈可在后台标记进度；寻游分别显示寻找中、有线索、已找到。
- 访客填写昵称并完成人机验证，主帖及回复都先进入待审核。昵称仅是展示文字，不授予身份或管理员权限；站长自己的昵称也可以正常投稿；第一版无访客编辑、账号、私信、附件或邮件通知。
- 主帖支持一层回复，回复本身不能继续产生嵌套层级。主帖和回复各按新到旧分页，每页 20 条。
- 留言板进入时自动读取首屏 20 条，游戏页评论仍由用户点击触发；Turnstile 在打开投稿表单后才加载。无定时轮询，不会为全部游戏分别请求评论数量。
- 提交成功明确告知等待审核，不将待审核内容插入公开列表。失败保留填写的文字；网络中断的提交可能已经到达服务器，提示用户避免重复提交。
- 审核台 `/admin/` 支持待审核、已公开、已拒绝、已隐藏或全部状态，并按分类、主帖/回复、处理进度和昵称/标题/内容关键词组合筛选；每页 20 条。支持查看回复原文、通过、拒绝、隐藏、处理进度、编辑昵称/标题/正文/主帖分类、删除及私有操作备注。
- 已隐藏主帖的回复不会通过公开接口返回，即使知道帖子编号也不行。恢复主帖后，原来已通过的回复也会恢复公开。

## 审核与数据边界

`entries.status` 是审核状态：pending / approved / rejected / hidden。`progress` 是讨论的处理进度：open / working / done，两者相互独立。

公开接口只返回 approved，且回复的原帖也必须 approved。浏览器传入的 status、progress 等字段无法让投稿自行通过审核。允许的游戏 ID 来自部署时的游戏清单，不能任意创建其他游戏的讨论。

管理员每次决定和审计记录在一个 D1 batch 中保存，同时检查 revision 与旧状态，防止旧页面覆盖编辑或审核结果。编辑保留审核状态，已公开内容编辑后立即生效；主帖分类更改同步其回复分类。删除为逻辑删除（deleted_at），主帖的全部回复也一并删除；所有公开查询、投稿与后台队列排除已删除内容，不提供恢复入口。内容及审计记录仍在私有数据库留存。`moderation_log` 保存操作者、前后状态、进度、备注与时间；不向公开接口提供。编辑与删除另存 `content_log`，包含操作者、修改前后内容与备注；后台暂未加入审计日志浏览器，可在 D1 控制台查询。

后台不仅依赖 Access 网关，还会验证 Access JWT 的签名、签发方、应用 AUD、有效期和管理员邮箱白名单。遗漏 Access 配置时拒绝访问，不设公开的开发绕过。审核写入要求同源 JSON 请求。正文以纯文本渲染，数据库查询均使用参数绑定。

投稿限长并使用 Turnstile 服务端验证，同时校验 hostname 和 action。验证失败或配置缺失时拒绝写入。Worker 的 IP 限流是每个 Cloudflare 位置内的尽力限制，不是全局精确计数；共享手机网络可能受到同一限额影响。可调整为合适的额度。本站 D1 不保存访客 IP、邮箱和 Turnstile token；Cloudflare 验证与网络服务仍会处理其运行所需的数据。

公开响应暂用 `no-store`，防止审核隐藏后仍返回缓存正文。已在读者屏幕上的旧内容不会主动撤回，刷新后消失。后续增加缓存时必须重新验证撤下内容的传播时间。

## 配置与部署

以下是完整部署流程。当前 D1 创建、初始迁移和 Worker 部署已完成，不要重复创建数据库；Turnstile 和 Access 接入配置已完成。当前下一步是发布本次留言板前端更新并完成真实投稿审核验收，见 [审核登录配置](ACCESS_SETUP.md)。无须提供账户密码或把密钥发到聊天里。

1. 在此目录复制 `wrangler.example.jsonc` 为 `wrangler.jsonc`。后者已忽略提交；公开示例不含凭据。以下命令的工作目录均为 `tools/community`，需要 Node.js 和 Wrangler 4。
2. 登录并创建 D1：

   ```powershell
   npx wrangler@4 login --scopes account:read user:read workers:write workers_scripts:write d1:write
   npx wrangler@4 d1 create westcreeper-community
   ```

   将返回的数据库 ID 填入配置的 `database_id`，再执行迁移：

   ```powershell
   npx wrangler@4 d1 migrations apply westcreeper-community --remote
   ```

3. 创建 Turnstile Managed widget，将实际博客域名加入允许列表。正式站和测试站建议使用不同 widget。站点公钥写入 `_data/community.yml` 的 `turnstile_site_key`；私钥仅写入 Worker Secret：

   ```powershell
   npx wrangler@4 secret put TURNSTILE_SECRET
   ```

   首次 Worker 尚不存在时，可先完成第 5 步部署，再设置 Secret；未设置前投稿自动拒绝。

4. 配置 `ALLOWED_ORIGINS` 为实际博客的完整 origin（协议＋域名，不含路径和末尾斜杠），`TURNSTILE_HOSTNAMES` 为对应域名，不带协议。示例列出的 westcreeper.com、www 与 GitHub 域名只是候选，删去不使用的项。正式环境不要加入 localhost。确认 `POST_LIMITER` 绑定存在；示例为每个边缘位置、每个 IP、每分钟 10 次投稿尝试。
5. 更新现有部署时先应用新增数据库迁移，再同步游戏清单并部署（当前数据库名为 `westcreeper_blog`）：

   ```powershell
   npx wrangler@4 d1 migrations apply westcreeper_blog --remote
   node sync-games.mjs
   node --test worker.test.mjs frontend.test.mjs
   npx wrangler@4 deploy
   ```

   获得 Worker 地址。推荐再绑定独立域名，例如 `community.westcreeper.com`（建议地址，尚未创建）。博客本身仍在 GitHub Pages；无需迁移博客，也无需调整游戏 R2 桶。
6. 在 Cloudflare Zero Trust → Access 中建立 Self-hosted application。在**同一个应用**内覆盖该服务域名的 `/admin`、`/admin/*`、`/api/admin/*`，只允许站长邮箱登录。**不要保护整个服务域名**，否则访客也必须登录才能读评论。可使用邮件验证码登录。记录团队名称与应用 AUD，填写 Worker 的 `ACCESS_TEAM`、`ACCESS_AUD`、`ADMIN_EMAILS`，再部署。团队名称仅填团队子域名部分。若启用了 workers.dev 或其他域名，不为其配置绕过策略；Worker 自身仍会验证 JWT。
7. 用正常邮箱登录 `/admin/` 确认可见，退出后确认后台和审核接口都被保护。务必测试 `/admin` 及 `/admin/` 两种入口，Access 应用的 AUD 必须与 Worker 一致。
8. `_data/community.yml` 中 `api_url` 填服务根地址，例如 `https://community.westcreeper.com`，不含 `/api`；完成 Turnstile 和 Access 配置后，将本机 Worker 配置的 `SUBMISSIONS_ENABLED` 改为 `true` 并部署，先在预发布站完成下述验收，再设博客 `enabled: true` 并正常发布。当前本机部署配置和博客开关已开启；以后回退时请区分服务端投稿开关和博客显示开关。

博客仅展示 Cloudflare 留言，旧 GitHub Issues 接口与历史链接已移除；没有删除或迁移仓库中的任何 Issue。将 `enabled: false` 重新发布后显示暂未开放提示，不恢复旧接口。紧急暂停投稿可把 Worker 的 `SUBMISSIONS_ENABLED` 改为 `false` 并部署，已公开内容仍可阅读。

## 运维与验证

每次新增或修改游戏 ID 后运行 `node sync-games.mjs` 并重新部署 Worker。仅修改游戏标题、简介、封面不需要更新 Worker。改 ID 相当于换讨论区；如需保留评论，应对 D1 scope 做明确迁移。现有清单包含 114 个游戏 ID。

本地测试（Node 24，自带 SQLite，无测试依赖）：

```powershell
node --test tools/community/worker.test.mjs tools/community/frontend.test.mjs
```

前端行为测试使用轻量 DOM 模型验证按需加载、纯文本输出、成功回执及失败保留草稿，不能代替浏览器视觉检查。后端测试执行真实 SQLite SQL 和 RSA 签名验证，使用模拟的 D1 绑定、Turnstile 响应、Access 公钥服务；不等价于线上 Cloudflare 联调。覆盖待审核不可见、禁止伪造审核字段、原帖隐藏后回复不可见、游戏隔离、验证码失败、限流、长度、CORS、管理员签名及权限、分页和审计一致性。

上线验收必须在真实服务补做：

- 从手机投稿游戏评论和寻游主帖：提交成功但退出当前浏览器后看不到待审核内容。
- 管理员批准后可见，回复同样需要审批；跨游戏不可串帖。
- 后台拒绝、隐藏主帖后，公开列表、回复直查和刷新均不能读到相关内容。
- 换未授权邮箱、移除 JWT、换服务备用域名均不能查看审核队列。
- 真实 Turnstile 成功／过期、Access 邮件登录、允许域名及预检通过；检查 Worker CPU、D1 读写用量。
- 模拟网络故障，确认保留草稿，游戏本身仍然正常运行。

D1 内容与 Git 仓库分开，需要另做备份。可用 `wrangler d1 export ... --remote --output <私有备份路径>` 导出；备份含待审核正文与审核记录，存放在仓库外。若以后放入 R2，应使用独立的私有桶。第一版没有创建定时任务，也没有自动清除被拒绝内容。

## 费用与官方依据

查阅于 2026-10-01；实际用量和账户已有服务共享额度需到控制台确认。

- Workers Free 当前每天 100,000 次请求，每次 10ms CPU；付费计划有基础月费和超额费用。不能保证流量增长后仍免费。[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- D1 Free 当前每天 500 万行读取、10 万行写入，总存储 5GB。按扫描行计算，不是请求数；索引也影响写入量，达到免费限额会暂时失败。[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)
- Turnstile 提供免费计划；验证码必须在服务端校验，令牌有效期 5 分钟且单次使用。人机验证不代替内容审核。[套餐](https://developers.cloudflare.com/turnstile/plans/)、[服务端校验](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- 管理员入口采用 Access，按实际 Zero Trust 账户套餐配置。Worker 内继续验签。[Access 与 Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[验证 JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- 限流器按边缘位置生效且最终一致，不能把它当成精确全局配额。[限流绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

先用免费额度试运行、关注实际请求量较合适。本次未升级套餐、创建付费资源或改动 DNS。

### 留言板管理更新验收（2026-10-02）

本地自动测试覆盖聚合留言分页、分类筛选、跨游戏回复归属、已审核才公开、后台组合筛选、编辑冲突、删除主帖与回复后不可读取、不可重新审核恢复。`0002_management.sql` 为增量迁移，不删除现有记录。

可使用已安装的 Playwright 与 Chromium 运行 `node tools/community/browser.test.cjs`，以 `BLOG_PREVIEW` 指定构建后的本地服务地址（默认 http://127.0.0.1:4000），`PLAYWRIGHT_MODULE` 指定模块路径、`BROWSER_EXE` 指定浏览器可执行文件。测试将全部社区写入请求拦截为模拟响应，不向正式服务写入。检查 390、820、1024、1440 像素布局、筛选、游戏回复、编辑与删除确认；截图放系统临时目录。它不替代正式站 Turnstile 与 Access 的真人登录/投稿验收。

验收记录：15 项本地行为测试通过，真实浏览器的模拟交互与四种宽度检查通过；根路径与 `/preview` 子路径构建均通过（127 页，118 条搜索条目）。线上聚合读取、分类读取及 Access 登录保护已复核。
