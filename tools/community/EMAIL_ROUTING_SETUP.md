# contact@westcreeper.com 接入后台收件箱

请使用带 @ 的邮箱地址 contact@westcreeper.com；contact.westcreeper.com 是域名格式。

## Cloudflare 操作

1. 打开 Cloudflare 控制台的 Compute → Email Service → Email Routing，选择 westcreeper.com。部分界面入口显示在网站域名内的“电子邮件 / Email Routing”。
2. 检查路由状态为启用。2026-10-02 的公开 DNS 已包含三条 Cloudflare MX；不需要重复添加或替换 MX。如果页面仍提示设置未完成，按控制台检查 SPF／域名状态，先保留已有记录。
3. 进入 Routing Rules（路由规则），点 Create address（创建地址）。如果已经存在 contact 规则，编辑该规则，避免重复。
4. Custom address 填 contact，域名选 westcreeper.com。
5. Action 选 Send to a Worker（发送到 Worker）。
6. Destination 选 westcreeper-community，保存并启用。
7. 保持 Catch-all 原有状态；本次不需要全域名兜底接收，勿改变其他地址的路由。
8. 用你自己的其他邮箱发一封普通纯文本邮件到 contact@westcreeper.com，标题如“收件测试”。不要附凭据或附件。
9. 打开 https://westcreeper-community.xiaoshuochyo.workers.dev/admin/ ，登录后选择“邮件收件箱”并点击查询。应显示测试邮件，可标记已读／已处理。

如果 Worker 没出现在下拉框，先确认选择正确账户、Worker 已部署包含 email() 处理器的版本，再刷新页面。若控制台首次引导要求验证一个 Destination address，那是普通转发目标：可用自己的现有邮箱完成引导；最终 contact 规则动作仍改为 Send to a Worker。

## 能做什么

后台可收信、查询、标记状态、写内部备注和删除。这里没有从 contact 地址发送回复的功能。Email Routing 的普通地址转发也不提供完整邮箱登录、IMAP 或 SMTP 发信账户；不要把 Cloudflare 的登录邮箱密码填入博客。

未配置路由前，新后台可以打开，但不会收到 contact 的邮件；数据库里没有邮件不代表路由已接通。需按第 8–9 步验收。

当前邮件限制：512 KiB，纯文本优先；附件不保存，正文过长会截断并标明。发件地址和邮件声称的饼干编号均不能直接用于重置身份。已经失去所有凭据的用户可提交求助，但不能保证找回。

## 饼干正式启用的另一项配置

Worker 的 Settings → Domains & Routes → Add → Custom Domain 中添加 community.westcreeper.com。为这个域名的 /admin、/admin/*、/api/admin/* 补充现有 Access 应用保护。博客前端 API 地址与 Worker 的 IDENTITY_ORIGIN 保持一致。完成域名、前端发布与 Cookie 验证后，再开启 IDENTITY_ENABLED；邮件路由本身不会开启饼干投稿。

[Cloudflare 官方路由说明](https://developers.cloudflare.com/email-service/get-started/route-emails/)
