import { fail } from "./http.mjs";

// Only the site's published manifest can create article discussion scopes.
const caches = new WeakMap();
export async function publishedArticles(env) {
  const cached = caches.get(env);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    try {
      const response = await fetch(
        "https://westcreeper.com/community-articles.json",
        {
          cf: { cacheTtl: 60, cacheEverything: true },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw Error("manifest unavailable");
      const raw = await response.text();
      if (raw.length > 1000000) throw Error("manifest too large");
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length > 5000)
        throw Error("invalid manifest");
      const map = new Map();
      for (const item of items) {
        if (
          typeof item.id !== "string" ||
          !item.id ||
          item.id.length > 500 ||
          typeof item.title !== "string" ||
          typeof item.url !== "string" ||
          !item.url.startsWith("/") ||
          item.url.startsWith("//") ||
          item.url.includes("\\") ||
          /[\x00-\x1f]/.test(item.id + item.url) ||
          map.has(item.id)
        )
          throw Error("invalid article");
        const url = new URL(item.url, "https://westcreeper.com");
        if (url.origin !== "https://westcreeper.com")
          throw Error("invalid article URL");
        map.set(item.id, { title: item.title, url: url.href });
      }
      return map;
    } catch {
      caches.delete(env);
      fail(503, "暂时无法确认文章信息，请稍后重试。");
    }
  })();
  caches.set(env, { promise, expires: Date.now() + 60000 });
  return promise;
}
export async function articleScope(value, env) {
  if (
    typeof value !== "string" ||
    !value.startsWith("article:") ||
    value.length > 508
  )
    return false;
  return (await publishedArticles(env)).has(value.slice(8));
}
