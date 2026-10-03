# 评论与讨论版：实现及 Cloudflare 上线说明

更新：2026-10-03。Worker 已启用 `IDENTITY_ENABLED=true`，留言与回复统一使用饼干身份，免登录昵称投稿分支已移除。D1 已完成 `0001` 至 `0008` 迁移，现有留言保留且不根据昵称自动归属新身份。用户已确认完成收信配置。

公开社区地址：`https://community.westcreeper.com`。审核后台继续使用 `https://westcreeper-community.xiaoshuochyo.workers.dev/admin/`（现有 Access 登录）。自定义域名的后台尚未配置 Access 登录入口，Worker 验签会拒绝未授权访问；如要从新域名登录，应先把其后台路径加入同一个 Access 应用。不要把整个公共服务加上 Access。

当前 Worker 版本：`de3a579d-61b2-4ade-b9ea-aa359ed5b949`。本次通过 `versions upload` 与 `versions deploy` 更新代码和变量，保留已配置的邮件路由、自定义域名及定时任务。本地 `wrangler.jsonc` 已同步开关与域名，并忽略提交。35 项自动测试、浏览器模拟交互、根路径及子路径构建通过。真实领取与恢复登录需要用户在正式站完成 Turnstile 后验收；测试未创建线上饼干、留言或发送邮件。

详细规则见 [身份方案](IDENTITY_PLAN.md)，邮件配置见 [邮件路由配置](EMAIL_ROUTING_SETUP.md)。


## 研究结论

原版留言板（旧脚本现已移除）直接读取公开 GitHub Issues，排除 PR，但没有按审核标签过滤，并同时展示打开和关闭的 Issue。关闭 Issue 不等于隐藏；即使在博客侧过滤，内容仍已在 GitHub 公开。因此它不适合作为“先审核后公开”的存储端。

新方案使用 GitHub Pages 展示页面，Cloudflare Worker 处理投稿与读取，D1 保存内容和审核记录，Turnstile 减少机器人投稿，Access 保护审核后台。R2 继续承载 SWF；第一版评论不需要 R2，不向公开游戏桶写入待审核内容。以后如加入图片附件，需单独设计私有上传、审核及公开流程。

## 已实现的交互

- 所有采用 `game` 布局的游戏页自动加入评论区，以 `game:<game_id>` 关联，改显示名称不影响评论。评论位于播放器外，不进入沉浸模式。
- `/guestbook/` 保留原地址，作为“留言板”汇总所有已公开的主帖，回复按主帖展开；顶部导航可直接进入。支持全部留言、游戏评论区、寻找游戏、问题建议、闲聊交流分类。游戏留言显示对应游戏名称与返回链接。寻游和反馈可在后台标记进度；寻游分别显示寻找中、有线索、已找到。
- 所有新留言和回复必须先领取 8 位数字身份或使用恢复码登录，服务器自动读取昵称。昵称唯一且每次更改间隔至少 7 天，历史留言保留昵称快照。主帖及回复都先进入待审核，饼干不授予管理员权限。没有访客编辑、私信、附件或邮件通知。
- 主帖支持一层回复，回复本身不能继续产生嵌套层级。主帖和回复各按新到旧分页，每页 20 条。
- 留言板进入时自动读取首屏 20 条，游戏页评论仍由用户点击触发；Turnstile 在打开投稿表单后才加载。无定时轮询，不会为全部游戏分别请求评论数量。
- 提交成功明确告知等待审核，不将待审核内容插入公开列表。失败保留填写的文字；网络中断的提交可能已经到达服务器，提示用户避免重复提交。
- 审核台 `/admin/` 支持待审核、已公开、已拒绝、已隐藏或全部状态，并按分类、主帖/回复、处理进度和昵称/标题/内容关键词组合筛选；每页 20 条。支持查看回复原文、通过、拒绝、隐藏、处理进度、编辑昵称/标题/正文/主帖分类、删除及私有操作备注。
- 已隐藏主帖的回复不会通过公开接口返回，即使知道帖子编号也不行。恢复主帖后，原来已通过的回复也会恢复公开。
- 后台新增饼干查询、停用与撤销登录；邮件收件箱支持纯文本查看、搜索、状态、备注和删除。邮件仅供管理员查看，当前不提供发信功能。

## 审核与数据边界

`entries.status` 是审核状态：pending / approved / rejected / hidden。`progress` 是讨论的处理进度：open / working / done，两者相互独立。

公开接口只返回 approved，且回复的原帖也必须 approved。浏览器传入的 status、progress 等字段无法让投稿自行通过审核。允许的游戏 ID 来自部署时的游戏清单，不能任意创建其他游戏的讨论。

管理员每次决定和审计记录在一个 D1 batch 中保存，同时检查 revision 与旧状态，防止旧页面覆盖编辑或审核结果。编辑保留审核状态，已公开内容编辑后立即生效；主帖分类更改同步其回复分类。删除为逻辑删除（deleted_at），主帖的全部回复也一并删除；所有公开查询、投稿与后台队列排除已删除内容，不提供恢复入口。内容及审计记录仍在私有数据库留存。`moderation_log` 保存操作者、前后状态、进度、备注与时间；不向公开接口提供。编辑与删除另存 `content_log`，包含操作者、修改前后内容与备注；后台暂未加入审计日志浏览器，可在 D1 控制台查询。

后台不仅依赖 Access 网关，还会验证 Access JWT 的签名、签发方、应用 AUD、有效期和管理员邮箱白名单。遗漏 Access 配置时拒绝访问，不设公开的开发绕过。审核写入要求同源 JSON 请求。正文以纯文本渲染，数据库查询均使用参数绑定。

投稿限长并使用 Turnstile 服务端验证，同时校验 hostname 和 action。验证失败或配置缺失时拒绝写入。Worker 的边缘 IP 限流是每个 Cloudflare 位置内的尽力限制；饼干领取另有 D1 原子计数，具体额度见身份方案。共享手机网络可能受到同一限额影响。D1 不保存明文访客 IP 或 Turnstile token；身份限流保存短期 IP 的 HMAC 值，收件箱保存发件地址与邮件正文。Cloudflare 验证与网络服务仍会处理其运行所需的数据。

公开响应暂用 `no-store`，防止审核隐藏后仍返回缓存正文。已在读者屏幕上的旧内容不会主动撤回，刷新后消失。后续增加缓存时必须重新验证撤下内容的传播时间。

## 配置与部署

以下是完整部署流程。当前数据库、迁移、Worker、Turnstile 和现有域名的 Access 已配置，不要重复创建。社区自定义域名已可访问，邮件路由已由用户配置；后续更新按以下流程操作，参见 [邮件路由配置](EMAIL_ROUTING_SETUP.md) 和 [审核登录配置](ACCESS_SETUP.md)。无须提供账户密码或把密钥发到聊天里。

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
   npm ci
   npx wrangler@4 d1 migrations apply westcreeper_blog --remote
   node sync-games.mjs
   node --test worker.test.mjs frontend.test.mjs identity.test.mjs
   npx wrangler@4 deploy
   ```

   获得 Worker 地址。本站已绑定独立域名 `community.westcreeper.com`。博客本身仍在 GitHub Pages；无需迁移博客，也无需调整游戏 R2 桶。
6. 在 Cloudflare Zero Trust → Access 中建立 Self-hosted application。在**同一个应用**内覆盖该服务域名的 `/admin`、`/admin/*`、`/api/admin/*`，只允许站长邮箱登录。**不要保护整个服务域名**，否则访客也必须登录才能读评论。可使用邮件验证码登录。记录团队名称与应用 AUD，填写 Worker 的 `ACCESS_TEAM`、`ACCESS_AUD`、`ADMIN_EMAILS`，再部署。团队名称仅填团队子域名部分。若启用了 workers.dev 或其他域名，不为其配置绕过策略；Worker 自身仍会验证 JWT。
7. 用正常邮箱登录 `/admin/` 确认可见，退出后确认后台和审核接口都被保护。务必测试 `/admin` 及 `/admin/` 两种入口，Access 应用的 AUD 必须与 Worker 一致。
8. `_data/community.yml` 中 `api_url` 填服务根地址，例如 `https://community.westcreeper.com`，不含 `/api`；完成 Turnstile 和 Access 配置后，将本机 Worker 配置的 `SUBMISSIONS_ENABLED` 改为 `true` 并部署，先在预发布站完成下述验收，再设博客 `enabled: true` 并正常发布。当前本机部署配置和博客开关已开启；以后回退时请区分服务端投稿开关和博客显示开关。

博客仅展示 Cloudflare 留言，旧 GitHub Issues 接口与历史链接已移除；没有删除或迁移仓库中的任何 Issue。将 `enabled: false` 重新发布后显示暂未开放提示，不恢复旧接口。紧急暂停投稿可把 Worker 的 `SUBMISSIONS_ENABLED` 改为 `false` 并部署，已公开内容仍可阅读。关闭 `IDENTITY_ENABLED` 也会暂停投稿，不会恢复免登录投稿。

## 运维与验证

每次新增或修改游戏 ID 后运行 `node sync-games.mjs` 并重新部署 Worker。仅修改游戏标题、简介、封面不需要更新 Worker。改 ID 相当于换讨论区；如需保留评论，应对 D1 scope 做明确迁移。现有清单包含 114 个游戏 ID。

本地测试（Node 24，自带 SQLite；先在 `tools/community` 执行 `npm ci` 安装邮件解析依赖）：

```powershell
node --test tools/community/worker.test.mjs tools/community/frontend.test.mjs tools/community/identity.test.mjs
```

前端行为测试使用轻量 DOM 模型验证按需加载、纯文本输出、成功回执及失败保留草稿，不能代替浏览器视觉检查。后端测试执行真实 SQLite SQL 和 RSA 签名验证，使用模拟的 D1 绑定、Turnstile 响应、Access 公钥服务；不等价于线上 Cloudflare 联调。覆盖待审核不可见、禁止伪造审核字段、原帖隐藏后回复不可见、游戏隔离、验证码失败、限流、长度、CORS、管理员签名及权限、分页和审计一致性。

上线验收必须在真实服务补做：

- 从手机投稿游戏评论和寻游主帖：提交成功但退出当前浏览器后看不到待审核内容。
- 管理员批准后可见，回复同样需要审批；跨游戏不可串帖。
- 后台拒绝、隐藏主帖后，公开列表、回复直查和刷新均不能读到相关内容。
- 换未授权邮箱、移除 JWT、换服务备用域名均不能查看审核队列。
- 真实 Turnstile 成功／过期、Access 邮件登录、允许域名及预检通过；检查 Worker CPU、D1 读写用量。
- 模拟网络故障，确认保留草稿，游戏本身仍然正常运行。

D1 内容与 Git 仓库分开，需要另做备份。可用 `wrangler d1 export ... --remote --output <私有备份路径>` 导出；备份含待审核正文、身份凭据哈希、邮件与审核记录，存放在仓库外。若以后放入 R2，应使用独立的私有桶。每天 UTC 03:17 清理过期会话、限流计数及超过两天的领取记录，不自动删除留言或邮件。

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

验收记录：29 项本地行为测试通过，包含身份规则、凭据撤销及邮件隔离；真实浏览器的模拟交互与四种宽度检查通过，包括领取、恢复登录和后台收件箱。根路径与 `/preview` 子路径构建均通过（127 页，118 条搜索条目）。线上聚合读取及新增后台接口的 Access 登录保护已复核。邮件路由已由用户确认配置；真实领取、恢复登录与手机 Cookie 持久性仍需用户验收。测试没有向任何邮箱发信。

### 默认头像与专属站长身份

已部署八款原创像素 SVG 头像及身份头像保存接口。「我的饼干」可选择头像；修改后历史留言显示新头像，昵称冷却不变。站长专属身份 `00000000 / 西部苦力怕` 已颁发，恢复码仅在本机私有文件交付。昵称炫彩仅绑定该编号，楼主与其他回复者编号使用不同颜色及文字标签。安全与兼容回归共 29 项通过，移动端头像选择、昵称样式及角色颜色通过浏览器检查。

### 表情回应、头像统一和人工恢复（2026-10-03）

已接入六种表情回应，每个饼干对每条公开留言／回复可选择一种，可替换或取消；动画仅在点击成功后运行，支持减少动态效果，不加载外部动画资源。计数随每页列表读取，无轮询；隐藏／删除原留言会同时隐藏回应，未登录和停用身份不能操作。新增增量迁移 `0006_reactions.sql`。

留言板、游戏评论及回复共用头像清单，未登录可看见头像选择位置但不能保存，当前头像在身份卡展示；审核台和饼干管理也展示头像。构建版本参数使各页面加载同一版样式和脚本。

饼干管理新增「核验后重置恢复码」：至少 20 字核验依据、输入完整编号、二次确认；旧码与所有会话失效，新码只在弹窗显示一次，可下载私密交付文件，数据库仅保存哈希及审计依据。不能仅凭昵称或发件地址判断归属。29 项自动测试及浏览器模拟覆盖回应切换／取消、隐藏原帖、身份限制、管理员核验、恢复登录、手机布局和减少动态效果。真实用户数据未用于测试重置。

### 紧凑回应栏与回应者名单

零回应只显示「😊＋」，面板提供六种表情，页面仅保留正计数项。悬停已有表情 220ms 后按需读取 `GET /api/entries/:id/reactions?reaction=like&after=00000000`；省略 reaction 时查看所有回应者。每页 20 人，返回公开昵称、饼干编号和表情，不返回任何身份凭据；主帖或回复不可见时名单同样不可见，停用身份不出现在名单内。客户端暂存 30 秒，自己的回应改变后立即清空，不轮询。

手机可从表情选择面板点「查看回应者」；键盘聚焦表情后按上方向键查看，Esc 关闭。30 项行为测试覆盖名单分页、保留零编号、隐藏主帖、停用身份和字段范围；浏览器测试覆盖悬停、短缓存、文本转义、触屏入口及紧凑显示。

### 文章评论（2026-10-03）

文章页沿用饼干、头像、回复、表情回应和先审核后公开机制。`article:<post.id>` 是独立讨论范围；分类由服务端确定为 article。留言板和审核台可筛选「文章评论区」并查看来源文章。

`community-articles.json` 随 Jekyll 构建生成，Worker 只接受该固定官网清单中的文章 ID，暂存约一分钟，不访问访客指定的地址。新文章发布后自动开放，无需逐篇部署 Worker；清单暂不可读时禁止创建未知讨论，审核后台仍能管理已有记录。文章改标题不改文件名即可保持 ID；重命名文件前应把原 ID 写入 front matter 的 `comment_id`，避免开启新的讨论范围。构建检查会拒绝重复 ID，并确认每篇文章都有评论组件。

`0007_article_comments.sql` 扩展分类约束，在事务内保留原留言 ID、自增序号、回复、回应及审核记录。按 [Cloudflare D1 外键文档](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) 在迁移中暂缓外键检查；本地带历史数据的迁移测试验证记录不变和约束恢复。线上迁移前已导出私有备份，迁移后各表数量一致，外键检查为空。

33 项行为测试通过，覆盖文章隔离、待审不可见、跨文章回复拒绝、审核编辑、表情回应、分类筛选、来源清单校验及数据库保留。浏览器模拟验证文章投稿/回复、头像、表情入口和手机布局；正式站只进行只读检查。


### 我的饼干个人中心

`/my-cookie/` 集中登录、领取、头像修改、改名、恢复码管理及退出；公开评论区只显示登录摘要和个人中心入口。返回链接仅支持同源路径，恢复码尚未保存时阻止返回。头像、身份、评论和表情系统继续共用原有记录，不迁移饼干数据。

新增 `GET /api/identity/entries?view=mine|participated&status=all|pending|approved|rejected|hidden&before=<id>`：必须有有效且未停用的会话，不接受前端指定身份。mine 仅返回本人的未删除留言和回复；participated 仅返回自己发表或通过已审核回复参与的公开主帖，永不返回别人的待审正文。每页 20 条，no-store，响应 owner 与当前身份核对。前端退出、切换身份和离开页面时清空记录，失效响应不会覆盖新身份内容。

公开读取支持 `entry=<主帖 ID>` 定位单条已通过审核的讨论；仍校验所属 scope、审核状态及删除状态。个人中心链接使用 `?discussion=<id>#comments`，可以一键返回全部讨论。该版本没有新增数据库迁移，也没有新增轮询或通知服务。

验证：34 项后端与前端行为测试、浏览器模拟领取/登录/返回/头像/改名/退出/跨页身份刷新、恶意返回地址拒绝，以及根路径和子路径构建通过。真实评论与身份未用于自动测试。


### 回复与审核站内通知（2026-10-03）

新增原创 re-ocd 风格的饼干 SVG，导航及个人中心共用。导航显示未读数量，手机折叠菜单显示提示点；「我的饼干」提供全部／未读筛选、每页 20 条、查看讨论、单条及全部已读，打开通知页不会自动清空未读。

`0008_notifications.sql` 新增通知表及审核日志触发器，与原审核事务一起完成。审核状态实际变化才通知留言作者，内部审核备注和管理员邮箱不进入通知。别人的回复第一次通过审核时通知主帖作者；不通知自己回复自己，也不因重复审核或进度调整重复提醒。旧审核记录不补发通知，避免历史提醒集中出现。采用 [D1 支持的 SQLite SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/)；线上迁移前已备份，外键检查通过。

接口：`GET /api/identity/notifications?filter=all|unread&before=<id>`、`GET /api/identity/notifications/unread`、`POST /api/identity/notifications/read`。写入参数为当前公开编号 `owner` 加 `id` 或 `through`，真实收件人始终由 HttpOnly 会话决定；编号不是凭据。全部已读只处理已读取批次的最大 ID 及之前的通知，不影响后来到达的新通知。隐藏回复或原帖后不再展示该回复通知，删除原帖后相关通知均不展示；列表与未读数使用同一可见性规则。

只在页面进入、手动刷新或离开超过一分钟后返回页面时检查，不设置轮询计时器；跨标签页登录状态／已读变化会同步刷新。不发邮件、不请求系统推送权限。通知正文用纯文本输出，响应 no-store，退出或离开页面清空个人列表。

35 项行为测试和浏览器模拟交互通过，覆盖待审不通知、审核原子性、重复审核、身份隔离、隐藏／删除、分页、批量已读快照、手机导航、单条与全部已读、纯文本和退出清理。正式站仅做只读验收，不借用站长饼干或制造测试留言。
