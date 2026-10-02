# 自动饼干、恢复码与求助收件箱

更新：2026-10-02。本方案替代此前的邮箱验证码方案。

## 已实现与上线开关

使用现有 Worker + D1；博客仍为 GitHub Pages。已实现领取、恢复码登录、昵称唯一与 7 天冷却、会话退出、恢复码重置、8 位作者编号、后台饼干查询／按编号查看留言／停用／撤销登录，以及 contact@westcreeper.com 收件箱。无需注册邮箱，也不自动发送邮件。

当前 `IDENTITY_ENABLED=false`：先部署兼容现有投稿的后台，再接好社区自定义域名和前端，最后开启强制饼干投稿。数据库增量迁移为 `0003_identities.sql` 和 `0004_inbox.sql`。上线前必须确认用户能保存 Cookie；不能直接在 workers.dev 跨站模式下启用。

## 产品规则

- 一次填写昵称并通过 Turnstile 后领取。8 位数字编号使用加密安全随机源分配（10000000–99999999），数据库唯一约束并重试碰撞。编号不是登录秘密。
- 昵称 2–24 字，支持 Unicode 文字、数字、空格、下划线、短横线、间隔点；拒绝零宽、控制和方向隐藏字符。NFKC 统一全角形式，昵称比较忽略大小写及空格；数据库唯一索引保证同时提交时也不可重名。
- 领取与每次改名后，服务器计时满 7×24 小时才可再次改名。只限制当前昵称唯一，旧昵称释放后可能被他人使用；8 位编号用于持续辨认身份。
- 历史留言保留当时昵称；不把昵称相同的旧留言归属给新饼干。无作者关联的历史记录显示旧版访客。
- 恢复码为 32 字节随机值，展示为 8 组十六进制字符。领取／重置时只显示一次，可下载文本备份；D1 仅存哈希，不保存明文，也不写日志。后台无法读取原恢复码。
- 恢复码登录需同时提供公开编号并通过 Turnstile。同一码可在新设备登录，直到主动重置；登录不自动换码，避免网络中断丢失新码。会话与恢复码是独立随机凭据。
- 登录凭据放 API 域名的 Secure、HttpOnly、SameSite=Lax、host-only Cookie，有效期 30 天。D1 仅存会话哈希；每次使用校验有效期、状态与凭据版本。
- 重置恢复码时其他设备和旧码失效，当前设备保留登录（即使响应中断也可再重置），必须保存新码。
- 所有投稿仍先审核。作者与昵称由服务器读取，不接受前端伪造作者编号。停用饼干会使全部登录失效，已有公开留言仍按原审核状态展示。

## 领取与登录频率

- 同一来源 IP：10 分钟内最多成功领取 1 个，滚动 24 小时最多 3 个。
- 全站：滚动 24 小时最多成功领取 100 个。
- 注册／登录合计：同一 IP 每 15 分钟最多尝试 10 次；另有现有边缘限流。
- 同一身份每小时最多登录 10 次，改名尝试每小时最多 10 次，重置恢复码每小时最多 5 次。
- 同一身份每分钟最多投稿 10 次，叠加现有来源限流。
- 成功领取额度在同一个 D1 batch 的条件 INSERT 中验证，跨 Cloudflare 节点共享额度；不单独依赖各节点的尽力限流。
- 不保存明文 IP：使用 Worker Secret `IDENTITY_PEPPER` 做 HMAC，领取记录 2 天后由定时任务清理；已过期限流计数与会话也清理。
- 共享网络会共享额度。换网络、代理和 IPv6 地址变化仍可能绕过按 IP 的限制，不保证一人一号，也不使用设备指纹。

## 后台接入

同一个 Access 审核台增加“饼干管理”和“邮件收件箱”。饼干列表可搜昵称／编号、按正常／停用状态筛选，显示领取时间、可改名时间、留言数量、有效登录数量，每页 20 条。点击查看留言会带编号筛选；停用、解除停用和注销全部设备需填写处理依据，并记录管理员审计。

不在普通留言编辑功能中修改有作者身份的昵称快照。后台不展示会话哈希或恢复码哈希。

## 恢复码丢失的求助

公开联系邮箱：contact@westcreeper.com。请用户提供编号和可核验线索，不要发送恢复码、密码或证件。

若仍有登录设备，优先自行重置恢复码。如果所有凭据都丢失，邮件只能提交求助，不能证明身份；发件人地址、公开昵称、公开留言截图都不足以单独认领身份。当前后台可查看与记录处理结果，没有自动按邮件重置身份的接口。无法可靠核验时建议重新领取，不承诺必能找回。

## 邮件接收

Worker 实现 email() 接收器，仅接受 contact@westcreeper.com。Cloudflare 路由动作为 Send to a Worker → westcreeper-community。域名 MX 已在 2026-10-02 查询确认为 Cloudflare 的 route*.mx.cloudflare.net，无须替换。

使用锁定版本 postal-mime 4.0.2 解析 MIME；邮件最大 512 KiB，正文最多 30,000 字符，附件只计数不保存。HTML-only 邮件以源码文字显示，不执行 HTML、不加载外链图片。相同原始内容去重；全站每日窗口 200 封、同发件地址每小时 20 封，超额拒收并提示稍后重试。

后台支持发件人／主题／正文搜索，未读／已读／已处理状态，内部备注和永久删除。邮件内容不进入公开接口，不发送自动回复；工作人员可用自己的现有邮箱另行回复。记录的发件地址不能视作身份认证。

## 部署和验证

1. `npm ci` 安装锁定依赖；运行 `node --test worker.test.mjs frontend.test.mjs identity.test.mjs`。
2. 应用 D1 新迁移。用安全随机值配置 Worker Secret `IDENTITY_PEPPER`，不写仓库。
3. 部署 Worker，设置 `CONTACT_EMAIL=contact@westcreeper.com`；先保持 `IDENTITY_ENABLED=false`。
4. Cloudflare Email Routing 添加／修改精确的 contact 规则，目标选择该 Worker。不要额外开 Catch-all。具体操作见 [邮件路由配置](EMAIL_ROUTING_SETUP.md)。
5. 为 Worker 添加 community.westcreeper.com 自定义域名；为新域名的后台路径补充同一 Access 应用保护（Worker 本身继续验证 JWT）。前端 API 地址改为该域名，保留精确 Origin 校验及带凭据 CORS。
6. 发布博客新前端后，确认自定义域名、Cookie、真实 Turnstile 和后台登录正常，再设置 `IDENTITY_ENABLED=true`。公开阅读仍不要求登录。
7. 运行时依赖位于 tools 下，不发布到 GitHub Pages；旧评论投稿在开关关闭时保持原行为。

自动测试覆盖昵称规范化冲突、7 天边界、额度、验证码、恢复登录、凭据重置与撤销、身份伪造、后台无凭据泄漏、收件 MIME／去重／地址限制、公开邮件隔离；浏览器使用模拟接口验证手机领取、保存恢复码、登录、昵称锁定和后台标签页。真实 Cookie、Email Routing 收信仍需配置后验收，测试不自动向任何邮箱发信。

## 官方资料

- [Cloudflare D1 batch 原子操作](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare 节点限流边界](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Email Routing 接入](https://developers.cloudflare.com/email-service/get-started/route-emails/)
- [Email Worker 接收 API](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/)
- [OWASP 凭据找回设计](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
