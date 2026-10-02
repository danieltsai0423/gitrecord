import { spawn } from "node:child_process";
import {
  aggregateCommits,
  shiftDate,
  taipeiDate,
  type CommitStat,
  type Report,
  type RepositoryReport,
} from "../shared/report.js";

export type Query = <T>(
  query: string,
  variables: Record<string, unknown>,
) => Promise<T>;
export type Progress = (
  completed: number,
  total: number,
  current: string,
) => void;

function githubError(raw: string): Error {
  if (/rate.limit|RATE_LIMITED|secondary rate/i.test(raw))
    return new Error("GitHub API 已達速率上限，請稍後重試。");
  if (/auth login|authentication|credentials|401|Bad credentials/i.test(raw))
    return new Error("GitHub 登入失效，請在終端機執行 gh auth login。");
  if (/ENOTFOUND|network|timeout|connection|ETIMEDOUT/i.test(raw))
    return new Error("GitHub 連線逾時或網路不可用，請稍後重試。");
  return new Error("GitHub 查詢失敗，請確認登入帳號與 repository 讀取權限。");
}

export const ghQuery: Query = <T>(
  query: string,
  variables: Record<string, unknown>,
) =>
  new Promise<T>((resolve, reject) => {
    const child = spawn("gh", ["api", "graphql", "--input", "-"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      error = "",
      settled = false;
    const finishError = (reason: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(reason);
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finishError(new Error("GitHub 查詢逾時，請稍後重試。"));
    }, 60000);
    child.on("error", () =>
      finishError(
        new Error("無法啟動 GitHub CLI，請先安裝 gh 並執行 gh auth login。"),
      ),
    );
    child.stdin.on("error", () =>
      finishError(new Error("無法將查詢傳送至 GitHub CLI。")),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 8 * 1024 * 1024) {
        child.kill();
        finishError(new Error("GitHub 回應過大，無法完成查詢。"));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (error.length < 65536) error += chunk.toString();
    });
    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        finishError(githubError(error));
        return;
      }
      try {
        const result = JSON.parse(output) as {
          data?: T;
          errors?: { message: string }[];
        };
        if (result.errors?.length || !result.data) {
          finishError(githubError(JSON.stringify(result.errors)));
          return;
        }
        settled = true;
        resolve(result.data);
      } catch {
        finishError(new Error("GitHub 回傳無效資料，請重試。"));
      }
    });
    child.stdin.end(JSON.stringify({ query, variables }));
  });

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
interface CommitPage {
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
  repository(owner: $owner, name: $name) {
    object(oid: $head) { ... on Commit {
      history(first: 100, after: $cursor, author: {id: $author}, since: $since, until: $until) {
        nodes { oid committedDate additions deletions parents { totalCount } }
        pageInfo { hasNextPage endCursor }
      }
    } }
  }
}`;

function nextCursor(info: PageInfo, seen: Set<string>): string | null {
  if (!info.hasNextPage) return null;
  if (!info.endCursor || seen.has(info.endCursor))
    throw new Error("GitHub 分頁游標重複或缺失，已停止避免漏計。");
  seen.add(info.endCursor);
  return info.endCursor;
}

export async function syncGithub(
  query: Query = ghQuery,
  progress: Progress = () => {},
  now = new Date(),
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
  do {
    const page: RepositoryPage = await query<RepositoryPage>(
      REPOSITORIES_QUERY,
      { cursor },
    );
    if (userId && userId !== page.viewer.id)
      throw new Error("同步途中 GitHub 帳號變更，請重新同步。");
    userId = page.viewer.id;
    user = {
      login: page.viewer.login,
      avatarUrl: page.viewer.avatarUrl,
      url: page.viewer.url,
    };
    for (const repo of page.viewer.repositories.nodes) {
      if (!seenRepos.has(repo.nameWithOwner)) {
        repoNodes.push(repo);
        seenRepos.add(repo.nameWithOwner);
      }
    }
    cursor = nextCursor(page.viewer.repositories.pageInfo, repoCursors);
  } while (cursor);
  if (!user) throw new Error("GitHub 未回傳帳號。");
  const included = repoNodes.filter((repo) => !repo.isFork);
  const repositories: RepositoryReport[] = [];
  for (const repo of included) {
    progress(repositories.length, included.length, repo.name);
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
        repositories.push({
          ...base,
          status: "error",
          error: error instanceof Error ? error.message : "同步失敗",
          daily: [],
          excludedMerges: 0,
        });
      }
    }
    progress(repositories.length, included.length, repo.name);
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
