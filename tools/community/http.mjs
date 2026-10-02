export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};
export const csv = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
export function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  )
    fail(400, "分页或留言编号无效。");
  return Number(value);
}
export function text(value, min, max, label) {
  if (typeof value !== "string") fail(400, `请填写${label}。`);
  const s = value.trim();
  if (
    s.length < min ||
    s.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)
  )
    fail(400, `${label}需为 ${min}–${max} 个字符。`);
  return s;
}
export async function body(request) {
  if (
    !(request.headers.get("content-type") || "").startsWith("application/json")
  )
    fail(415, "请使用 JSON 提交。");
  if (!request.body) fail(400, "提交内容为空。");
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      fail(413, "提交内容过长。");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    fail(400, "提交格式无效。");
  }
}
