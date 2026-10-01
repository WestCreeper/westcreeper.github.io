// Access identity is verified inside the Worker too, including on alternate hostnames.
const cache = new Map();
const decode = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export async function authenticate(request, env) {
  if (
    !/^[a-z0-9-]+$/.test(env.ACCESS_TEAM || "") ||
    !env.ACCESS_AUD ||
    !env.ADMIN_EMAILS
  )
    return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16384) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const head = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
    const now = Date.now() / 1000;
    if (
      head.alg !== "RS256" ||
      typeof head.kid !== "string" ||
      claims.iss !== issuer ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(env.ACCESS_AUD) ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 30 ||
      (claims.nbf !== undefined &&
        (!Number.isFinite(claims.nbf) || claims.nbf > now + 30)) ||
      typeof claims.email !== "string" ||
      !env.ADMIN_EMAILS.split(",")
        .map((s) => s.trim().toLowerCase())
        .includes(claims.email.toLowerCase())
    )
      return null;
    let keys = cache.get(issuer);
    if (!keys || keys.expires < Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      keys = {
        data: (await response.json()).keys,
        expires: Date.now() + 300000,
      };
      cache.set(issuer, keys);
    }
    const jwk = keys.data.find((k) => k.kid === head.kid && k.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return ok ? claims.email : null;
  } catch {
    return null;
  }
}
