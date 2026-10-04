import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { createApp, loadReport, saveReport } from "../server/app.js";
import { normalizeStore, type Report, type ReportStore } from "../shared/report.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthManager } from "../server/auth.js";
import { credential, MemoryConfig, MemoryCredentials, provider, appSettings, publicSettings } from "./auth-fixture.js";
import { GithubOAuth } from "../server/oauth.js";

test("完整本機 OAuth 與同步直接使用 GitHub HTTP API，無 CLI／secret，權杖不回傳瀏覽器", async (t) => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.clientId = "";
  const request: typeof fetch = async (url, options) => {
    const headers = new Headers(options?.headers);
    if (url === "https://api.github.com/apps/test-gitrecord") {
      assert.equal(headers.has("Authorization"), false);
      return Response.json({ id: Number(appSettings.appId), slug: appSettings.appSlug, client_id: appSettings.clientId, permissions: { contents: "read", metadata: "read" } });
    }
    if (url === "https://github.com/login/device/code") {
      assert.equal(new URLSearchParams(String(options?.body)).has("scope"), false);
      return Response.json({ device_code: "PRIVATE-DEVICE", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    }
    if (url === "https://github.com/login/oauth/access_token") {
      assert.equal(new URLSearchParams(String(options?.body)).has("client_secret"), false);
      return Response.json({ access_token: "PRIVATE-ACCESS", refresh_token: "PRIVATE-REFRESH", token_type: "bearer" });
    }
    assert.equal(headers.get("Authorization"), "Bearer PRIVATE-ACCESS");
    if (url === "https://api.github.com/user") return Response.json({ id: 1, login: "example" });
    if (String(url).startsWith("https://api.github.com/user/installations?")) return Response.json({ total_count: 1, installations: [
      { id: 99, app_id: Number(appSettings.appId), app_slug: appSettings.appSlug, account: { id: 1, type: "User" }, repository_selection: "selected", permissions: { contents: "read", metadata: "read" } },
    ] });
    if (String(url).startsWith("https://api.github.com/user/installations/99/repositories?")) return Response.json({ total_count: 1, repositories: [
      { id: 101, node_id: "R_SELECTED", owner: { id: 1 } },
    ] });
    assert.equal(url, "https://api.github.com/graphql");
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.variables.ids, ["R_SELECTED"]);
    assert.doesNotMatch(body.query, /repositories\(first/);
    return Response.json({ data: { viewer: { id: "NODE1", login: "example", avatarUrl: "", url: "https://github.com/example" }, nodes: [
      { nameWithOwner: "example/selected", name: "selected", owner: { login: "example" }, url: "", isPrivate: true, isFork: false, primaryLanguage: null, defaultBranchRef: null },
    ] } });
  };
  const auth = new AuthManager({ config, credentials, request, provider: new GithubOAuth(request, async () => {}) });
  const app = createApp({ auth, save: async () => {} });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => { auth.cancelLogin(); server.close(); });
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const configure = await fetch(`${base}/api/auth/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(publicSettings) });
  assert.equal(configure.status, 200);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST" })).status, 202);
  for (let i = 0; i < 20 && auth.running; i++) await new Promise(setImmediate);
  assert.equal(auth.snapshot.error, null);
  const statusText = await (await fetch(`${base}/api/auth`)).text();
  assert.doesNotMatch(statusText, /PRIVATE-ACCESS|PRIVATE-REFRESH|PRIVATE-DEVICE/);
  assert.equal((await fetch(`${base}/api/sync`, { method: "POST" })).status, 202);
  await new Promise(setImmediate);
  const saved = await (await fetch(`${base}/api/report`)).json();
  assert.equal(saved.accounts[0].report.user.login, "example");
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE-ACCESS|PRIVATE-REFRESH|PRIVATE-DEVICE/);
});

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
  assert.deepEqual(await response.json(), normalizeStore(report));
});

test("OAuth API 的來源保護、同步互鎖與登入取消；帳號清單只回傳 metadata", async (t) => {
  let finishSync: (value: Report) => void = () => {};
  let loginCalls = 0;
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1";
  credentials.values = [{ ...credential(), accessToken: "should-never-be-returned" }];
  const auth = new AuthManager({ config, credentials, provider: provider({
    device: async () => { loginCalls++; return { deviceCode: "private-device", userCode: "ABCD-1234", interval: 5, expiresIn: 900 }; },
    authorize: async (_clientId, _device, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("授權已取消。")))),
  }) });
  const app = createApp({
    auth,
    sync: async () => new Promise((resolve) => { finishSync = resolve; }),
    save: async () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => { auth.cancelLogin(); server.close(); });
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const path of ["login", "switch", "cancel", "config", "forget"]) {
    assert.equal((await fetch(`${base}/api/auth/${path}`, { method: "POST", headers: { origin: "https://untrusted.example" } })).status, 403);
  }
  const authState = await (await fetch(`${base}/api/auth`)).json();
  assert.deepEqual(authState.accounts, [{ login: "example", active: true, state: "success" }]);
  assert.doesNotMatch(JSON.stringify(authState), /should-never-be-returned/);
  assert.equal((await fetch(`${base}/api/auth/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "--help" }) })).status, 400);
  await fetch(`${base}/api/sync`, { method: "POST" });
  assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST" })).status, 409);
  assert.equal(loginCalls, 0);
  finishSync(report);
  await new Promise(setImmediate);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST" })).status, 202);
  assert.equal((await fetch(`${base}/api/sync`, { method: "POST" })).status, 409);
  assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST" })).status, 409);
  assert.equal((await fetch(`${base}/api/auth/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: "example" }) })).status, 409);
  assert.equal((await (await fetch(`${base}/api/auth`)).json()).code, "ABCD-1234");
  await fetch(`${base}/api/auth/cancel`, { method: "POST" });
  await new Promise(setImmediate);
  assert.equal(auth.running, false);
  assert.equal(auth.snapshot.code, null);
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
  assert.deepEqual(await (await fetch(`${base}/api/report`)).json(), normalizeStore(report));
  assert.equal(
    (await fetch(`${base}/api/sync`, { method: "POST" })).status,
    202,
  );
});

test("連續同步兩帳號、重同步不重複；全域失敗狀態保存且成功後清除", async (t) => {
  let next = report;
  let failure = false;
  let saved: ReportStore | null = null;
  const app = createApp({
    initialReport: report,
    sync: async (progress) => {
      progress(0, 0, "帳號", next.user);
      if (failure) throw new Error("測試失敗");
      return next;
    },
    save: async (store) => { saved = store; },
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sync = async () => {
    await fetch(`${base}/api/sync`, { method: "POST" });
    await new Promise(setImmediate);
    return await (await fetch(`${base}/api/report`)).json() as ReportStore;
  };
  next = { ...report, user: { ...report.user, login: "other" } };
  assert.equal((await sync()).accounts.length, 2);
  assert.equal((await sync()).accounts.length, 2);
  failure = true;
  const failed = await sync();
  assert.equal(failed.accounts.find((a) => a.report.user.login === "other")?.syncError, "測試失敗");
  assert.equal(failed.accounts.find((a) => a.report.user.login === "example")?.syncError, null);
  assert.deepEqual(saved, failed);
  failure = false;
  assert.equal((await sync()).accounts.find((a) => a.report.user.login === "other")?.syncError, null);
});

test("快取自動讀取舊格式，原子保存多帳號並保留失敗資訊", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gitrecord-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "report.json");
  assert.equal(await loadReport(path), null);
  await writeFile(path, JSON.stringify(report));
  const store = (await loadReport(path))!;
  assert.deepEqual(store, normalizeStore(report));
  store.accounts[0].syncError = "測試錯誤";
  await saveReport(store, path);
  assert.deepEqual(await loadReport(path), store);
  await writeFile(path, "{}");
  await assert.rejects(() => loadReport(path), /快取格式無效/);
});

test("快取寫入失敗保留全部已保存帳號", async (t) => {
  const app = createApp({
    initialReport: report,
    sync: async () => ({ ...report, user: { ...report.user, login: "other" } }),
    save: async () => { throw new Error("磁碟寫入失敗"); },
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await fetch(`${base}/api/sync`, { method: "POST" });
  await new Promise(setImmediate);
  assert.deepEqual(await (await fetch(`${base}/api/report`)).json(), normalizeStore(report));
  assert.equal((await (await fetch(`${base}/api/sync/status`)).json()).error, "磁碟寫入失敗");
});
