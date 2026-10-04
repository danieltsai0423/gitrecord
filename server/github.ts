import { jsonRequest, type Fetch } from "./http.js";
import {
  aggregateCommits, shiftDate, taipeiDate,
  type CommitStat, type Report, type RepositoryReport,
} from "../shared/report.js";

export type Query = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
export type Progress = (completed: number, total: number, current: string, account?: Report["user"]) => void;

function githubError(status: number, body: Record<string, any>): Error {
  const detail = JSON.stringify(body.errors ?? body.message ?? "");
  if (status === 429 || /rate.limit|RATE_LIMITED|secondary rate/i.test(detail))
    return new Error("GitHub API 已達速率上限，請稍後重試。");
  if (status === 401 || /authentication|credentials|Bad credentials/i.test(detail))
    return new Error("GitHub 登入失效，請重新新增帳號授權。");
  return new Error("GitHub 查詢失敗，請確認登入帳號與 repository 讀取權限。");
}

export function createGithubQuery(token: () => Promise<string>, request: Fetch = fetch): Query {
  return async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const accessToken = await token();
    const { status, body } = await jsonRequest(request, "https://api.github.com/graphql", {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`, "User-Agent": "GitRecord" },
      body: JSON.stringify({ query, variables }),
    });
    if (status !== 200 || body.errors?.length || !body.data) throw githubError(status, body);
    return body.data as T;
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface RepoNode {
  name: string;
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
  isFork: boolean;
  primaryLanguage: { name: string; color: string } | null;
  defaultBranchRef: { name: string; target: { oid: string } } | null;
}
interface RepositoryPage {
  viewer: {
    id: string;
    login: string;
    avatarUrl: string;
    url: string;
    repositories: { nodes: RepoNode[]; pageInfo: PageInfo };
  };
}
interface SelectedPage { viewer: Pick<RepositoryPage["viewer"], "id" | "login" | "avatarUrl" | "url">; nodes: (RepoNode | null)[]; }
interface CommitPage {
  viewer: { id: string };
  repository: {
    object: { history: { nodes: CommitStat[]; pageInfo: PageInfo } } | null;
  } | null;
}

export const REPOSITORIES_QUERY = `query Repositories($cursor: String) {
  viewer { id login avatarUrl url
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) {
      nodes { name nameWithOwner url isPrivate isFork primaryLanguage { name color }
        defaultBranchRef { name target { oid } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export const COMMITS_QUERY = `query History($owner: String!, $name: String!, $head: GitObjectID!, $author: ID!, $since: GitTimestamp!, $until: GitTimestamp!, $cursor: String) {
  viewer { id }
  repository(owner: $owner, name: $name) {
    object(oid: $head) { ... on Commit {
      history(first: 100, after: $cursor, author: {id: $author}, since: $since, until: $until) {
        nodes { oid committedDate additions deletions parents { totalCount } }
        pageInfo { hasNextPage endCursor }
      }
    } }
  }
}`;

export const SELECTED_REPOSITORIES_QUERY = `query SelectedRepositories($ids: [ID!]!) {
  viewer { id login avatarUrl url }
  nodes(ids: $ids) { ... on Repository {
    name nameWithOwner url isPrivate isFork primaryLanguage { name color }
    defaultBranchRef { name target { oid } }
  } }
}`;

function nextCursor(info: PageInfo, seen: Set<string>): string | null {
  if (!info.hasNextPage) return null;
  if (!info.endCursor || seen.has(info.endCursor))
    throw new Error("GitHub 分頁游標重複或缺失，已停止避免漏計。");
  seen.add(info.endCursor);
  return info.endCursor;
}

class AccountChangedError extends Error {}

export async function syncGithub(
  query: Query,
  progress: Progress = () => {},
  now = new Date(),
  selectedRepositoryIds?: readonly string[],
): Promise<Report> {
  const end = taipeiDate(now),
    start = shiftDate(end, -364),
    until = now.toISOString();
  const since = `${start}T00:00:00+08:00`;
  const repoNodes: RepoNode[] = [];
  let user: Report["user"] | null = null,
    userId = "",
    cursor: string | null = null;
  const repoCursors = new Set<string>(),
    seenRepos = new Set<string>();
  progress(0, 0, "讀取帳號與 repository 清單");
  if (selectedRepositoryIds) {
    const ids = [...new Set(selectedRepositoryIds)];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      const page = await query<SelectedPage>(SELECTED_REPOSITORIES_QUERY, { ids: batch });
      if (userId && userId !== page.viewer.id) throw new Error("同步途中 GitHub 帳號變更，請重新同步。");
      userId = page.viewer.id;
      user = { id: userId, login: page.viewer.login, avatarUrl: page.viewer.avatarUrl, url: page.viewer.url };
      progress(0, 0, "讀取 repository 清單", user);
      if (!Array.isArray(page.nodes) || page.nodes.length !== batch.length || page.nodes.some((repo) => !repo))
        throw new Error("GitHub App 存取範圍在查詢期間改變，請重新同步。");
      for (const repo of page.nodes) {
        if (!repo || repo.nameWithOwner.split("/")[0].toLowerCase() !== user.login.toLowerCase())
          throw new Error("GitHub App 回傳其他帳號的 repository，已停止同步。");
        if (!seenRepos.has(repo.nameWithOwner)) { seenRepos.add(repo.nameWithOwner); repoNodes.push(repo); }
      }
    }
  } else do {
    const page: RepositoryPage = await query<RepositoryPage>(
      REPOSITORIES_QUERY,
      { cursor },
    );
    if (userId && userId !== page.viewer.id)
      throw new Error("同步途中 GitHub 帳號變更，請重新同步。");
    userId = page.viewer.id;
    user = {
      id: page.viewer.id,
      login: page.viewer.login,
      avatarUrl: page.viewer.avatarUrl,
      url: page.viewer.url,
    };
    progress(0, 0, "讀取 repository 清單", user);
    for (const repo of page.viewer.repositories.nodes) {
      if (!seenRepos.has(repo.nameWithOwner)) {
        repoNodes.push(repo);
        seenRepos.add(repo.nameWithOwner);
      }
    }
    cursor = nextCursor(page.viewer.repositories.pageInfo, repoCursors);
  } while (cursor);
  if (!user) throw new Error("GitHub 未回傳帳號。");
  progress(0, 0, "已確認登入帳號", user);
  const included = repoNodes.filter((repo) => !repo.isFork);
  const repositories: RepositoryReport[] = [];
  for (const repo of included) {
    progress(repositories.length, included.length, repo.name, user);
    const base = {
      name: repo.name,
      fullName: repo.nameWithOwner,
      url: repo.url,
      private: repo.isPrivate,
      branch: repo.defaultBranchRef?.name ?? null,
      language: repo.primaryLanguage?.name ?? null,
      languageColor: repo.primaryLanguage?.color ?? null,
    };
    if (!repo.defaultBranchRef) {
      repositories.push({
        ...base,
        status: "empty",
        ...aggregateCommits([], start, end),
      });
    } else {
      try {
        const commits: CommitStat[] = [],
          cursors = new Set<string>();
        let after: string | null = null;
        do {
          const page: CommitPage = await query<CommitPage>(COMMITS_QUERY, {
            owner: user.login,
            name: repo.name,
            head: repo.defaultBranchRef.target.oid,
            author: userId,
            since,
            until,
            cursor: after,
          });
          if (page.viewer.id !== userId)
            throw new AccountChangedError("同步途中 GitHub 帳號變更，請重新同步；本次資料未保存。");
          const history = page.repository?.object?.history;
          if (!history) throw new Error("無法讀取預設分支的 commit 歷史。");
          commits.push(...history.nodes);
          after = nextCursor(history.pageInfo, cursors);
        } while (after);
        repositories.push({
          ...base,
          status: "complete",
          ...aggregateCommits(commits, start, end),
        });
      } catch (error) {
        if (error instanceof AccountChangedError) throw error;
        repositories.push({
          ...base,
          status: "error",
          error: error instanceof Error ? error.message : "同步失敗",
          daily: [],
          excludedMerges: 0,
        });
      }
    }
    progress(repositories.length, included.length, repo.name, user);
  }
  if (
    repositories.length &&
    repositories.every((repo) => repo.status === "error")
  )
    throw new Error(
      "所有 repositories 同步失敗；請確認網路、API 額度與帳號權限。",
    );
  return {
    version: 1,
    user,
    generatedAt: new Date().toISOString(),
    range: { start, end, until },
    timezone: "Asia/Taipei",
    partial: repositories.some((repo) => repo.status === "error"),
    excludedForks: repoNodes.length - included.length,
    repositories,
  };
}
