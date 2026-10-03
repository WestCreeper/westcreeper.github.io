import test from "node:test";
import assert from "node:assert/strict";
import { publishedArticles, articleScope } from "./articles.mjs";
test("article allowlist uses a fixed trusted manifest, caches reads, and fails closed", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const valid = [
    {
      id: "/2021/02/26/中文文章",
      title: "中文文章",
      url: "/2021/02/26/article.html",
    },
  ];
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, "https://westcreeper.com/community-articles.json");
      calls++;
      return Response.json(valid);
    };
    const env = {};
    assert.equal(await articleScope("article:/2021/02/26/中文文章", env), true);
    assert.equal(await articleScope("article:invented", env), false);
    assert.equal(await articleScope("game:dadnme", env), false);
    assert.equal(calls, 1);
    assert.equal((await publishedArticles(env)).size, 1);
    for (const bad of [
      [...valid, ...valid],
      [{ ...valid[0], url: "//evil.test/" }],
      { id: "invalid" },
    ]) {
      globalThis.fetch = async () => Response.json(bad);
      await assert.rejects(
        () => publishedArticles({}),
        (e) => e.status === 503,
      );
    }
    const retryEnv = {};
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(
      () => publishedArticles(retryEnv),
      (e) => e.status === 503,
    );
    globalThis.fetch = async () => Response.json(valid);
    assert.equal(
      await articleScope("article:/2021/02/26/中文文章", retryEnv),
      true,
    );
  } finally {
    globalThis.fetch = original;
  }
});
