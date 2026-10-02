import { fail, text, csv } from "./http.mjs";
export async function verifyChallenge(value, env) {
  if (!env.TURNSTILE_SECRET || !csv(env.TURNSTILE_HOSTNAMES).length)
    fail(503, "人机验证尚未配置完成。");
  const token = text(value, 1, 2048, "人机验证");
  let verified;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) fail(503, "验证服务暂不可用，请稍后重试。");
    verified = await response.json();
  } catch {
    fail(503, "验证服务暂不可用，请稍后重试。");
  }
  if (
    !verified.success ||
    verified.action !== "community" ||
    !csv(env.TURNSTILE_HOSTNAMES).includes(verified.hostname)
  )
    fail(400, "人机验证已失效，请重新验证。");
}
