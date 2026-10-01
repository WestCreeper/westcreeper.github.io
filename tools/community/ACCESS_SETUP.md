# 当前下一步：配置审核后台登录

2026-10-01。D1、Worker、Turnstile 与 Access 配置已接好；以下第 1–4 步已完成，管理员真实登录及队列读取已通过站长截图确认。服务端和本地博客投稿开关已开启，尚待推送博客后进行第 5 步的真实投稿、批准和隐藏验收。

已确认团队为 `westcreeper`，管理员邮箱为 `xiaoshuochyo@gmail.com`，应用 AUD 为 `02d0665ab89a4801b59c79aaa50bd6b21842b02835c8c7fd4f2c8313ebdb9482`。审核路径均跳转到该团队及应用，公开评论接口不要求登录。

## 1. 进入 Zero Trust

打开 Cloudflare 的 Zero Trust（也可能显示 Cloudflare One）。若第一次使用，建立团队并记录团队名称，例如团队地址是 `my-team.cloudflareaccess.com`，后续提供 `my-team`。如需要选择套餐，可选择 Free，账户开通和账单资料由站长本人完成。

新团队目前默认可以选择 Cloudflare 账号登录。审核后台使用这一登录方式即可。如果更喜欢邮件验证码，可以额外到 Integrations → Identity providers 添加 One-time PIN；它并非所有新团队都默认启用。

## 2. 新建一个 Access 应用

进入 Access controls / Access → Applications → Create new application / Add an application，选择 Self-hosted（新版可能写 Self-hosted and private）。

应用名称：`WestCreeper 评论审核`。

使用主机名／路径方式，在**同一个应用**中添加以下三个公开地址：

| 主机名 | 路径 |
| --- | --- |
| `westcreeper-community.xiaoshuochyo.workers.dev` | `/admin` |
| `westcreeper-community.xiaoshuochyo.workers.dev` | `/admin/*` |
| `westcreeper-community.xiaoshuochyo.workers.dev` | `/api/admin/*` |

如果表单将路径前的 `/` 固定显示在输入框外，只输入 `admin`、`admin/*`、`api/admin/*`。

只保护这三个地址，**不要选择保护整个 Worker 或整个主机名**：访客读取评论和提交待审内容使用 `/api/entries`，需要保持公开可达。

若控制台不接受 `workers.dev` 主机名，请先停在该页面，把提示发给我；不要改成保护全站。可以另行给服务绑定本站的自有子域名。

## 3. 设置允许登录的人

添加一条 Allow 策略，例如 `站长审核`。

Include 条件选择 Emails，填写你准备用来审核的邮箱。若沿用本次 Cloudflare 登录账户，则是 `xiaoshuochyo@gmail.com`；也可以指定其他由你控制、可使用所选登录方式的邮箱。不要选择 Everyone。

选择可用的 Cloudflare 登录方式；只有事先配置了 One-time PIN，才能选择邮件验证码。

高级 Cookie 设置保持默认，不要开启 Cookie Path Attribute：后台页面和审核 API 位于两个不同路径，需要共用同一次登录。

## 4. 保存后提供三项配置

- **团队名称**：团队域名中 `.cloudflareaccess.com` 前的部分。
- **Application Audience (AUD)**：打开刚创建的应用详情，复制应用 AUD。
- **管理员邮箱**：与 Allow 策略中设置的邮箱一致。

这些是接入配置，不是登录令牌、密码或邮件验证码。拿到后会写入 Worker 的 `ACCESS_TEAM`、`ACCESS_AUD`、`ADMIN_EMAILS` 并重新部署。

## 5. 最后验收与开放

先检查公开接口仍能返回内容，而后台入口会跳转到登录。由站长完成一次真实登录；确认能读取审核队列后，再开启投稿测试。验证投稿只进入待审核、批准后显示、隐藏后消失，最后开启博客 `_data/community.yml` 中的开关并正常发布博客。

当前 Worker 的 `SUBMISSIONS_ENABLED` 与本地博客 `enabled` 都已开启；GitHub Pages 需推送后才能更新。若暂时停止接收投稿，将 Worker 的 `SUBMISSIONS_ENABLED` 改为 `false` 并部署；博客 `enabled` 只控制前端展示。

官方依据：[Worker 的主机名与路径保护](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[Zero Trust 初始设置](https://developers.cloudflare.com/cloudflare-one/setup/)、[邮件验证码登录](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)、[Access Cookie 路径](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)。
