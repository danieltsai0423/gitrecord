export type Fetch = typeof fetch;

export async function jsonRequest(
  request: Fetch, url: string, options: RequestInit, limit = 8 * 1024 * 1024,
): Promise<{ status: number; body: Record<string, any> }> {
  let response: Response;
  try {
    response = await request(url, {
      ...options, redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
  } catch {
    if (options.signal?.aborted) throw new Error(options.signal.reason?.name === "TimeoutError"
      ? "GitHub 授權已逾時，請重新新增帳號。" : "授權已取消。");
    throw new Error("GitHub 連線逾時或網路不可用，請稍後重試。");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub 回傳無效資料，請重試。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("GitHub 回應過大，無法完成查詢。");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof Error && error.message === "GitHub 回應過大，無法完成查詢。") throw error;
    throw new Error("GitHub 連線逾時或網路不可用，請稍後重試。");
  } finally { reader.releaseLock(); }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return { status: response.status, body: body as Record<string, any> };
  } catch { throw new Error("GitHub 回傳無效資料，請重試。"); }
}
