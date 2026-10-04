import test from "node:test";
import assert from "node:assert/strict";
import { AuthManager } from "../server/auth.js";
import { GithubOAuth } from "../server/oauth.js";
import { credential, MemoryConfig, MemoryCredentials, provider, settled, clientId, publicSettings } from "./auth-fixture.js";

test("直接 OAuth 從零登入保存憑證，重新啟動保留帳號；API 只顯示 metadata", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  let finish: () => void = () => {};
  const oauth = provider({ authorize: async () => {
    await new Promise<void>((resolve) => { finish = resolve; });
    return { clientId, accessToken: "fake-access-1", refreshToken: "fake-refresh-1" };
  } });
  const auth = new AuthManager({ config, credentials, provider: oauth });
  assert.deepEqual((await auth.status()).accounts, []);
  auth.startLogin();
  await new Promise(setImmediate);
  assert.equal(auth.snapshot.code, "ABCD-1234");
  assert.equal(auth.running, true);
  assert.throws(() => auth.startLogin(), /已在進行/);
  assert.doesNotMatch(JSON.stringify(auth.snapshot), /fake-access|fake-refresh|private-device/);
  finish(); await settled(auth);
  assert.equal(auth.snapshot.error, null);
  assert.equal(credentials.values[0].accessToken, "fake-access-1");
  assert.equal(auth.snapshot.code, null);
  const restarted = new AuthManager({ config, credentials, provider: oauth });
  assert.deepEqual((await restarted.status()).accounts, [{ login: "example", active: true, state: "success" }]);
});

test("切換白名單、固定同步身份、移除登入仍保留其他憑證", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1";
  credentials.values = [credential(), credential("2", "other")];
  const headers: string[] = [];
  const auth = new AuthManager({ config, credentials, provider: provider(), request: async (_url, options) => {
    headers.push(new Headers(options?.headers).get("Authorization")!);
    return Response.json({ data: { ok: true } });
  } });
  const originalQuery = await auth.query();
  await auth.switchAccount("unknown"); await settled(auth);
  assert.match(auth.snapshot.error ?? "", /尚未登入/);
  await auth.switchAccount("other"); await settled(auth);
  assert.equal(auth.snapshot.accounts.find((account) => account.active)?.login, "other");
  await originalQuery("query", {});
  await (await auth.query())("query", {});
  assert.deepEqual(headers, ["Bearer fake-access-1", "Bearer fake-access-2"]);
  await auth.forgetAccount("other");
  assert.deepEqual(auth.snapshot.accounts, [{ login: "example", active: false, state: "success" }]);
  assert.equal(credentials.values.length, 1);
});

test("到期 token 單次更新且核對帳號，更新後安全保存", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1";
  credentials.values = [{ ...credential(), expiresAt: 1 }];
  let refreshes = 0;
  const headers: string[] = [];
  const auth = new AuthManager({ config, credentials, provider: provider({ refresh: async () => {
    refreshes++;
    await new Promise(setImmediate);
    return { clientId, accessToken: "rotated-access-1", refreshToken: "rotated-refresh-1", expiresAt: Date.now() + 1000000 };
  } }), request: async (_url, options) => {
    headers.push(new Headers(options?.headers).get("Authorization")!);
    return Response.json({ data: {} });
  } });
  const query = await auth.query();
  await Promise.all([query("query", {}), query("query", {})]);
  assert.equal(refreshes, 1);
  assert.deepEqual(headers, ["Bearer rotated-access-1", "Bearer rotated-access-1"]);
  assert.equal(credentials.values[0].refreshToken, "rotated-refresh-1");
});

test("刷新登入狀態期間阻止切換 OAuth App，避免混用帳號憑證", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1"; credentials.values = [credential()];
  let finish: () => void = () => {};
  const auth = new AuthManager({ config, credentials, provider: provider({ identity: async () => {
    await new Promise<void>((resolve) => { finish = resolve; });
    return { id: "1", login: "example" };
  } }) });
  const refreshing = auth.status(true);
  await new Promise(setImmediate);
  assert.equal(auth.running, true);
  assert.equal((await auth.status()).running, true);
  await assert.rejects(() => auth.configure({ ...publicSettings, clientId: "another-client-id" }), /已在進行/);
  await assert.rejects(() => auth.forgetAccount("example"), /已在進行/);
  finish(); await refreshing;
  assert.equal(auth.running, false);
  assert.equal(auth.snapshot.configuration?.clientId, clientId);
  assert.deepEqual(auth.snapshot.accounts, [{ login: "example", active: true, state: "success" }]);
});

test("拒絕身份混用，失敗保存和取消期間不啟用或留下新憑證", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1"; credentials.values = [credential()];
  const mixed = new AuthManager({ config, credentials, provider: provider({ identity: async () => ({ id: "2", login: "other" }) }) });
  await mixed.switchAccount("example"); await settled(mixed);
  assert.match(mixed.snapshot.error ?? "", /身份不一致/);
  assert.equal(config.value.activeId, "1");
  const emptyConfig = new MemoryConfig(), emptyStore = new MemoryCredentials();
  let release: () => void = () => {};
  const oldSave = emptyStore.save.bind(emptyStore);
  emptyStore.save = async (entry) => { await oldSave(entry); await new Promise<void>((resolve) => { release = resolve; }); };
  const canceled = new AuthManager({ config: emptyConfig, credentials: emptyStore, provider: provider() });
  canceled.startLogin(); await new Promise(setImmediate);
  canceled.cancelLogin(); release(); await settled(canceled);
  assert.match(canceled.snapshot.error ?? "", /取消/);
  assert.equal(emptyStore.values.length, 0);
  assert.equal(emptyConfig.value.activeId, null);
  assert.equal(canceled.snapshot.code, null);
});

test("OAuth device flow 遵守 pending／slow_down、刷新不需要 secret，token 不進 URL", async () => {
  let now = 0;
  const waits: number[] = [], calls: { url: string; params: URLSearchParams }[] = [];
  const responses = [
    { device_code: "device-secret", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 },
    { error: "authorization_pending" }, { error: "slow_down", interval: 10 },
    { access_token: "access", refresh_token: "refresh", expires_in: 28800, refresh_token_expires_in: 100000, token_type: "bearer" },
    { access_token: "new-access", refresh_token: "new-refresh", expires_in: 28800, token_type: "bearer" },
  ];
  const oauth = new GithubOAuth(async (url, options) => {
    calls.push({ url: String(url), params: new URLSearchParams(String(options?.body)) });
    return Response.json(responses.shift());
  }, async (ms) => { waits.push(ms); now += ms; }, () => now);
  const signal = new AbortController().signal;
  const device = await oauth.device(clientId, signal);
  const tokens = await oauth.authorize(clientId, device, signal);
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.equal(tokens.accessToken, "access");
  assert.equal((await oauth.refresh({ ...credential(), ...tokens })).refreshToken, "new-refresh");
  assert.equal(calls[0].params.has("scope"), false);
  assert.ok(calls.every(({ url, params }) => !url.includes("secret") && !params.has("client_secret")));
});

test("OAuth 拒絕、逾時、惡意授權 URL 和 token 回應錯誤都不洩漏秘密", async () => {
  const signal = new AbortController().signal;
  const bad = new GithubOAuth(async () => Response.json({ device_code: "SECRET", user_code: "ABCD-1234", verification_uri: "https://untrusted.example", expires_in: 900, interval: 5 }));
  await assert.rejects(() => bad.device(clientId, signal), /無效資料/);
  for (const code of ["access_denied", "device_flow_disabled", "incorrect_client_credentials"]) {
    const oauth = new GithubOAuth(async () => Response.json({ error: code, error_description: "SECRET" }));
    await assert.rejects(() => oauth.device(clientId, signal), (error: Error) => !error.message.includes("SECRET"));
  }
  for (const invalid of [
    { token_type: 12 }, { expires_in: -1 }, { refresh_token: 123 }, { refresh_token_expires_in: "SECRET" },
  ]) {
    const oauth = new GithubOAuth(async () => Response.json({ access_token: "SECRET", token_type: "bearer", ...invalid }));
    await assert.rejects(() => oauth.refresh(credential()), /無效資料/);
  }
  let now = 0;
  const expired = new GithubOAuth(async () => { throw new Error("must not request"); }, async (ms) => { now += ms; }, () => now);
  await assert.rejects(() => expired.authorize(clientId, { deviceCode: "SECRET", userCode: "ABCD-1234", expiresIn: 2, interval: 5 }, signal), /逾時/);
});

test("缺少 Client ID 時明確提示，設定後可以直接登入且保留原有 app 的帳號", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.clientId = "";
  const auth = new AuthManager({ config, credentials, provider: provider() });
  auth.startLogin(); await settled(auth);
  assert.match(auth.snapshot.error ?? "", /GitHub App/);
  await assert.rejects(() => auth.configure("bad"), /無效/);
  await auth.configure(publicSettings);
  auth.startLogin(); await settled(auth);
  assert.equal(auth.snapshot.accounts[0].login, "example");
});

test("未安裝／暫停／寫入權限阻止同步，安裝就緒只提供 whitelist 並在每次同步重新檢查", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  config.value.activeId = "1"; credentials.values = [credential()];
  let state: "missing" | "ready" | "suspended" | "permissions" = "missing";
  const auth = new AuthManager({ config, credentials, provider: provider({ connection: async () => ({
    state, url: "https://github.com/settings/installations/99", selection: "selected", repositoryCount: state === "ready" ? 1 : 0,
    repositoryIds: state === "ready" ? ["R_ALLOWED"] : [],
  }) }) });
  for (state of ["missing", "suspended", "permissions"] as const) {
    await assert.rejects(() => auth.source());
    assert.equal(auth.snapshot.installation?.state, state);
  }
  state = "ready";
  assert.deepEqual((await auth.source()).repositoryIds, ["R_ALLOWED"]);
  assert.doesNotMatch(JSON.stringify(auth.snapshot), /R_ALLOWED|fake-access/);
  state = "missing";
  await assert.rejects(() => auth.source(), /選擇/);
});

test("安裝檢查失敗回復新憑證，無法驗證 App 的設定不取代原設定", async () => {
  const config = new MemoryConfig(), credentials = new MemoryCredentials();
  const auth = new AuthManager({ config, credentials, provider: provider({ connection: async () => { throw new Error("測試安裝 API 失敗"); } }) });
  auth.startLogin(); await settled(auth);
  assert.equal(credentials.values.length, 0);
  assert.equal(config.value.activeId, null);
  assert.equal(auth.snapshot.accounts.length, 0);
  assert.match(auth.snapshot.error ?? "", /安裝 API/);
  const rejected = new AuthManager({ config, credentials, provider: provider({ verifyApp: async () => { throw new Error("App 設定不一致"); } }) });
  await assert.rejects(() => rejected.configure({ ...publicSettings, clientId: "different-public-client" }), /不一致/);
  assert.equal(config.value.clientId, clientId);
});
