# 邮箱验证的饼干身份：接入研究

日期：2026-10-02。状态：研究建议，未实现、未改变线上投稿规则，未开通邮件服务。

## 结论与用户体验

适合现有 GitHub Pages + Worker + D1 + Turnstile 架构。属于增加轻量身份系统，需要后端验证和会话管理，不能仅靠前端保存昵称实现。

建议允许任何人阅读，新投稿及回复需持有邮箱验证过的身份；仍先审核后公开。首次操作为：输入邮箱 → 收取验证码 → 验证 → 设置昵称 → 自动领取饼干。以后自动读取昵称，无需每次输入邮箱或昵称。跨设备、清除浏览器数据或会话过期后，用同一邮箱重新验证即可取回同一身份。每台设备获得独立会话；不复制、导出登录密钥。

公开示例：`像素旅人 · 饼干 #58210473`。编号为随机数字，数据库唯一约束并处理碰撞。编号永久关联站内身份，昵称可另行修改；不使用邮箱、邮箱哈希或 IP 生成公开编号。公开编号不是登录凭据。持久公开编号会使不同游戏下的发言可关联，需要在领取时明确说明；称为化名发言，不承诺对站方完全匿名。

## 当前代码与接入点

- `entries` 仅有投稿时填写的 nickname，尚无作者身份外键。
- `assets/js/community.js` 的请求使用 `credentials: omit`，目前没有会话状态。
- `auth.mjs` 验证 Cloudflare Access 管理员 JWT，只用于后台。访客邮箱认证另设模块，不能把访客加入管理员 Access 白名单。
- `_data/community.yml` 的 API 地址仍为 workers.dev，和正式博客 westcreeper.com 不同站点。
- 新增个人身份区可放在留言板和游戏评论表单上方：领取／找回饼干、当前昵称与编号、修改昵称、退出此设备、退出所有设备。

## 域名与 Cookie

建议在现有 Worker 上增加 `community.westcreeper.com` 自定义域名。博客静态内容仍留在 GitHub Pages，SWF 仍留在 R2。

将登录会话放在 API 域名的 host-only Cookie：`__Host-wc_session`，Secure、HttpOnly、Path=/、SameSite=Lax，不设置 Domain。密钥由加密安全随机源生成至少 32 字节，D1 仅保存其哈希。公开编号与密钥完全独立。建议会话初版有效期 30 天，过期重新邮件验证；实际保存时间仍受浏览器清理、用户退出影响。

westcreeper.com 与 community.westcreeper.com 在 HTTPS 下同站但不同源，需要前端 credentials: include、服务端精确允许 Origin 及 Access-Control-Allow-Credentials。写操作校验 Origin 并要求 JSON；不能仅依赖 SameSite 防止同站其他子域发起请求。workers.dev 与 github.io 不作为正式登录宿主；从 GitHub 域名访问时提示到正式域名完成身份操作，不扩大 Cookie 范围。

新增自定义域名时，需要为其后台路径同步配置 Access，并保持 Worker 自身的 JWT 校验。不能将整个社区域名保护成管理员登录页。

## 数据与接口建议

- identities：内部 ID、公开饼干编号、当前昵称、邮箱查找标识、验证时间、账户状态、创建时间。
- sessions：密钥哈希、作者 ID、到期时间、撤销状态；每设备独立，可以一次撤销全部会话。
- email_challenges：挑战 ID、邮箱查找标识、验证码 HMAC、有效期、错误尝试次数、消费状态。建议 10 分钟有效，最多尝试 5 次，重发冷却 60 秒；以上是待实现的初始参数。
- entries 新增可空 author_id，保留原有 nickname 作为投稿时快照。服务器从有效会话写入作者 ID 和昵称，不接受客户端指定作者、验证标记或管理员角色。
- `POST /api/auth/request-code`、`POST /api/auth/verify-code`、`GET /api/me`、个人昵称修改及退出接口。验证码只消费一次，成功创建会话与消费验证码应保证并发安全。
- 邮箱可用带服务端密钥的 HMAC 作为查找标识；如需保存可恢复的完整邮箱，另行加密存储。明文不进入公开接口、前端资源或日志；普通审核卡片无需显示完整邮箱。仅普通 SHA-256 邮箱哈希不视为充分保护。

一个已验证邮箱对应一个身份；不擅自去掉邮箱中的点号或加号别名来合并身份。邮箱验证只能证明当时可收信，不能证明实名或保证一人一号。需要配合发送验证码、验证尝试与发言的限流；Turnstile 不能替代这些限制。

昵称修改需审核或保留已批准昵称直到新昵称获批，防止通过改名绕开人工审核。站长标识由后台身份关系单独授予，不靠昵称匹配。封禁按 author_id 判断并使会话失效，普通用户无法通过清理 Cookie 解除同一身份的封禁。

## 邮件发送选择

核实于 2026-10-02：

| 方案 | 官方资料所列条件 | 适用情况 |
| --- | --- | --- |
| Resend | 免费档每月 3,000 封、每天 100 封；需注册并验证发信域名 | 尚未购买 Workers Paid，优先控制费用 |
| Cloudflare Email Sending（Beta） | 向任意收件人发送需 Workers Paid；每月包含 3,000 封，超出 $0.35 / 1,000 封 | 已有 Workers Paid，或希望集中管理 |

Cloudflare Email Routing 免费发送到的是账户中预先验证的目标地址，不应拿它当作给任意新访客发送验证码的通道。是否已具备 Paid / Email Sending 使用条件仍需检查账户，不能仅凭已创建 Worker、D1、R2 推断。

建议使用专门发信子域名，按邮件服务要求配置 DNS 验证并实际测试 QQ、163、Gmail 等目标邮箱的送达；不承诺一定进入收件箱。只在领取、找回或会话过期时发信，不为每次评论发送。给验证码发送设置每邮箱、每 IP 和全站预算上限，以及统一的账户存在性响应和明确的额度耗尽提示。验证码不写入日志。

## 现有数据与发布顺序

1. 先确定发信服务并配置社区子域名；不自动购买付费方案。
2. 加入增量数据库迁移与身份接口、Cookie 和昵称界面；维持现有审核功能。
3. 历史留言 author_id 为空，标注“旧版访客”；不能仅凭相同昵称绑定到新身份。原有评论和回复关系保持不变。
4. 后台增加按饼干编号查看留言、身份封禁与会话撤销，不直接开放公开的全站作者历史搜索。
5. 验证之后再切换为邮箱验证投稿。降级或邮件服务不可用时不可自动放开身份校验；给出稍后重试提示，保留本地草稿。

验证范围：验证码错误／过期／重放／并发消费、发送限额、会话过期与撤销、凭据伪造、Origin、跨设备找回、旧留言归属、已封禁身份、审核状态、iPhone Safari 和无痕窗口、邮件送达。自动化使用邮件模拟器，真实验证码发送需用户发起或明确授权。

预计新增负载来自打开讨论区时一次身份查询、投稿时会话校验、验证码请求与发送。无轮询，不随动画帧或游戏运行发请求；不能保证零负载或永不超额，费用取决于真实访问与发信量。

## 官方参考

- [Cloudflare Email Service 价格与任意收件人限制](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare 邮件发送及域名配置](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Cloudflare Workers 自定义域名](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Resend 当前价格](https://resend.com/pricing)
- [Resend 发信域名验证](https://resend.com/docs/dashboard/domains/introduction)
- [MDN：第三方 Cookie 与浏览器限制](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies)
- [MDN：HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies)
