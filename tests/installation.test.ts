import test from "node:test";
import assert from "node:assert/strict";
import { inspectInstallation, verifyApp } from "../server/installation.js";
import { appSettings } from "./auth-fixture.js";

const permissions = { contents: "read", metadata: "read" };
const own = { id: 99, app_id: Number(appSettings.appId), app_slug: appSettings.appSlug,
  account: { id: 1, type: "User" }, repository_selection: "selected", permissions };
const token = "PRIVATE-USER-TOKEN";

test("核對公開 App ID／Client ID／slug 與唯讀權限，不傳送憑證", async () => {
  const app = { id: Number(appSettings.appId), client_id: appSettings.clientId, slug: appSettings.appSlug, permissions };
  const request = (body: unknown): typeof fetch => async (url, options) => {
    assert.equal(url, "https://api.github.com/apps/test-gitrecord");
    assert.equal(new Headers(options?.headers).has("Authorization"), false);
    assert.equal(options?.redirect, "error");
    return Response.json(body);
  };
  await verifyApp(request(app), appSettings);
  for (const invalid of [{ ...app, id: 88 }, { ...app, client_id: "wrong" }, { ...app, slug: "other" },
    { ...app, permissions: { contents: "write", metadata: "read" } }, { ...app, permissions: { ...permissions, issues: "write" } }])
    await assert.rejects(() => verifyApp(request(invalid), appSettings));
});

test("個人帳號安裝隔離 org／其他帳號，repo 白名單完整分頁且不信任 html_url", async () => {
  const allRepos = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, node_id: `R_${i}`, owner: { id: 1 } }));
  const calls: string[] = [];
  const request: typeof fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer " + token);
    assert.ok(String(url).startsWith("https://api.github.com/"));
    assert.equal(String(url).includes(token), false);
    if (String(url).includes("/repositories?")) {
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return Response.json({ total_count: 101, repositories: allRepos.slice((page - 1) * 100, page * 100) });
    }
    return Response.json({ total_count: 3, installations: [
      { ...own, id: 98, account: { id: 1, type: "Organization" } },
      { ...own, id: 97, account: { id: 2, type: "User" } },
      { ...own, html_url: "https://untrusted.example/PRIVATE" },
    ] });
  };
  const connection = await inspectInstallation(request, appSettings, "1", token);
  assert.equal(connection.state, "ready");
  assert.equal(connection.url, "https://github.com/settings/installations/99");
  assert.equal(connection.selection, "selected");
  assert.equal(connection.repositoryCount, 101);
  assert.deepEqual(connection.repositoryIds, allRepos.map((repo) => repo.node_id));
  assert.equal(calls.length, 3);
});

test("未安裝、空存取、暫停與寫入權限都有明確狀態，其他擁有者的 repos 不入統計", async () => {
  for (const [installations, expected] of [
    [[], "missing"], [[{ ...own, account: { id: 2, type: "User" } }], "missing"],
    [[{ ...own, suspended_at: "2026-10-01" }], "suspended"],
    [[{ ...own, permissions: { ...permissions, issues: "write" } }], "permissions"], [[own], "empty"],
  ] as const) {
    const request: typeof fetch = async (url) => String(url).includes("/repositories?")
      ? Response.json({ total_count: 1, repositories: [{ id: 8, node_id: "R_OTHER", owner: { id: 2 } }] })
      : Response.json({ total_count: installations.length, installations });
    const connection = await inspectInstallation(request, appSettings, "1", token);
    assert.equal(connection.state, expected);
    assert.deepEqual(connection.repositoryIds, []);
  }
});

test("repo 權限變更、重複分頁與 API 錯誤會中止，錯誤不洩漏上游回應", async () => {
  for (const repositories of [[{ id: 1, node_id: "R_1", owner: { id: 1 } }],
    [{ id: 1 }, { id: 1 }]]) {
    const request: typeof fetch = async (url) => String(url).includes("/repositories?")
      ? Response.json({ total_count: 2, repositories }) : Response.json({ total_count: 1, installations: [own] });
    await assert.rejects(() => inspectInstallation(request, appSettings, "1", token));
  }
  for (const status of [401, 403, 429]) {
    const request: typeof fetch = async () => Response.json({ message: token }, { status });
    await assert.rejects(() => inspectInstallation(request, appSettings, "1", token), (error: Error) => !error.message.includes(token));
  }
});
