import type { InstallationStatus } from "../shared/report.js";
import type { AppSettings } from "./credentials.js";
import { appUrl } from "./credentials.js";
import { jsonRequest, type Fetch } from "./http.js";

export interface Connection extends InstallationStatus { repositoryIds: string[]; }

async function get(request: Fetch, path: string, token?: string, signal?: AbortSignal) {
  const { status, body } = await jsonRequest(request, "https://api.github.com" + path, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "GitRecord", "X-GitHub-Api-Version": "2026-03-10",
      ...(token ? { Authorization: "Bearer " + token } : {}) }, signal,
  });
  if (status === 401) throw new Error("GitHub 登入失效，請重新新增帳號授權。");
  if (status === 429 || /rate.limit/i.test(String(body.message ?? "")))
    throw new Error("GitHub API 已達速率上限，請稍後重試。");
  if (status !== 200) throw new Error("無法讀取 GitHub App 安裝狀態，請確認權限並重試。");
  return body;
}

export async function verifyApp(request: Fetch, config: AppSettings, signal?: AbortSignal) {
  const body = await get(request, "/apps/" + config.appSlug, undefined, signal);
  if (String(body.id) !== config.appId || body.slug !== config.appSlug || body.client_id !== config.clientId)
    throw new Error("GitHub App ID、Client ID 與公開頁網址不一致，請檢查設定。");
  if (body.permissions?.contents !== "read" || body.permissions?.metadata !== "read" ||
    Object.values(body.permissions).includes("write"))
    throw new Error("請將 GitHub App 的 Contents 設為 Read-only，並移除寫入權限。");
}

async function pages(request: Fetch, path: string, key: "installations" | "repositories", token: string, signal?: AbortSignal) {
  const entries: Record<string, any>[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= 1000; page++) {
    const body = await get(request, path + "?per_page=100&page=" + page, token, signal);
    const rows = body[key];
    if (!Array.isArray(rows) || rows.length > 100 || !Number.isSafeInteger(body.total_count) || body.total_count < 0)
      throw new Error("GitHub 回傳無效資料，請重試。");
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || seen.has(row.id))
        throw new Error("GitHub 分頁游標重複或缺失，已停止避免漏計。");
      seen.add(row.id); entries.push(row);
    }
    if (rows.length < 100) {
      if (entries.length !== body.total_count) throw new Error("GitHub App 存取範圍在查詢期間改變，請重新同步。");
      return entries;
    }
  }
  throw new Error("GitHub App 清單過大，請縮小存取範圍後重試。");
}

export async function inspectInstallation(request: Fetch, config: AppSettings, userId: string, token: string, signal?: AbortSignal): Promise<Connection> {
  const base: Connection = { state: "missing", url: appUrl(config.appSlug) + "/installations/new",
    selection: null, repositoryCount: 0, repositoryIds: [] };
  const installations = await pages(request, "/user/installations", "installations", token, signal);
  // Account IDs share the GitHub global namespace. Ignore organization and
  // other-account installations even if the user can access them.
  const own = installations.find((entry) => entry.app_id === Number(config.appId) && entry.account?.id === Number(userId) && entry.account?.type === "User");
  if (!own) {
    if (installations.some((entry) => entry.app_id !== Number(config.appId)))
      throw new Error("GitHub App ID、Client ID 與公開頁網址不一致，請檢查設定。");
    return base;
  }
  if (own.app_slug !== config.appSlug) throw new Error("GitHub App ID、Client ID 與公開頁網址不一致，請檢查設定。");
  base.url = "https://github.com/settings/installations/" + own.id;
  base.selection = own.repository_selection === "all" ? "all" : "selected";
  if (own.suspended_at) return { ...base, state: "suspended" };
  if (own.permissions?.contents !== "read" || own.permissions?.metadata !== "read" || Object.values(own.permissions).includes("write"))
    return { ...base, state: "permissions" };
  const repositories = await pages(request, "/user/installations/" + own.id + "/repositories", "repositories", token, signal);
  const owned = repositories.filter((repo) => repo.owner?.id === Number(userId));
  if (owned.some((repo) => typeof repo.node_id !== "string" || !repo.node_id))
    throw new Error("GitHub 回傳無效資料，請重試。");
  return { ...base, state: owned.length ? "ready" : "empty", repositoryCount: owned.length,
    repositoryIds: owned.map((repo) => repo.node_id) };
}
