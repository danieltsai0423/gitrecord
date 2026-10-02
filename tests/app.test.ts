import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { createApp } from "../server/app.js";
import type { Report } from "../shared/report.js";

const report: Report = {
  version: 1,
  user: { login: "example", avatarUrl: "", url: "" },
  generatedAt: "2026-10-02T00:00:00Z",
  range: {
    start: "2025-10-03",
    end: "2026-10-02",
    until: "2026-10-02T00:00:00Z",
  },
  timezone: "Asia/Taipei",
  partial: false,
  excludedForks: 0,
  repositories: [],
};

test("同步鎖、首次 404、成功快取與來源／Host 保護", async (t) => {
  let complete: (value: Report) => void = () => {},
    saved = false;
  const app = createApp({
    sync: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    save: async () => {
      saved = true;
    },
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(`${base}/api/report`)).status, 404);
  assert.equal(
    (
      await fetch(`${base}/api/sync`, {
        method: "POST",
        headers: { origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const rejectedHost = await new Promise<number | undefined>(
    (resolve, reject) => {
      get(
        `${base}/api/report`,
        { headers: { host: "untrusted.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      ).on("error", reject);
    },
  );
  assert.equal(rejectedHost, 403);
  assert.equal(
    (await fetch(`${base}/api/sync`, { method: "POST" })).status,
    202,
  );
  assert.equal(
    (await fetch(`${base}/api/sync`, { method: "POST" })).status,
    409,
  );
  assert.equal(
    (await (await fetch(`${base}/api/sync/status`)).json()).running,
    true,
  );
  complete(report);
  await new Promise(setImmediate);
  assert.equal(saved, true);
  const response = await fetch(`${base}/api/report`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), report);
});

test("失敗保留上次成功報告，顯示錯誤並可再次同步", async (t) => {
  const app = createApp({
    initialReport: report,
    sync: async () => {
      throw new Error("測試連線失敗");
    },
    save: async () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await fetch(`${base}/api/sync`, { method: "POST" });
  const status = await (await fetch(`${base}/api/sync/status`)).json();
  assert.equal(status.running, false);
  assert.equal(status.error, "測試連線失敗");
  assert.deepEqual(await (await fetch(`${base}/api/report`)).json(), report);
  assert.equal(
    (await fetch(`${base}/api/sync`, { method: "POST" })).status,
    202,
  );
});
