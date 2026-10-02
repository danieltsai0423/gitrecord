import test from "node:test";
import assert from "node:assert/strict";
import { COMMITS_QUERY, syncGithub, type Query } from "../server/github.js";

const repo = (name: string, isFork = false) => ({
  name,
  nameWithOwner: `example/${name}`,
  url: `https://github.com/example/${name}`,
  isPrivate: true,
  isFork,
  primaryLanguage: null,
  defaultBranchRef: { name: "main", target: { oid: `head-${name}` } },
});
const viewer = (nodes: unknown[], cursor: string | null = null) => ({
  viewer: {
    id: "USER",
    login: "example",
    avatarUrl: "",
    url: "https://github.com/example",
    repositories: {
      nodes,
      pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor },
    },
  },
});
const history = (nodes: unknown[], cursor: string | null = null) => ({
  repository: {
    object: {
      history: {
        nodes,
        pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor },
      },
    },
  },
});
const commit = {
  oid: "one",
  committedDate: "2026-10-01T16:00:00Z",
  additions: 8,
  deletions: 2,
  parents: { totalCount: 1 },
};
const now = new Date("2026-10-02T04:00:00Z");

test("repo／commit 完整分頁，以帳號 ID 篩選作者且每頁固定 HEAD，fork 排除", async () => {
  const queries: Record<string, unknown>[] = [];
  const query: Query = async <T>(
    text: string,
    vars: Record<string, unknown>,
  ) => {
    if (text.includes("query Repositories"))
      return (
        vars.cursor
          ? viewer([repo("fork", true)])
          : viewer([repo("alpha")], "repos-next")
      ) as T;
    queries.push(vars);
    return (
      vars.cursor
        ? history([commit, { ...commit, oid: "two", additions: 4 }])
        : history([commit], "commits-next")
    ) as T;
  };
  const report = await syncGithub(query, undefined, now);
  assert.equal(report.repositories.length, 1);
  assert.equal(report.excludedForks, 1);
  assert.equal(report.repositories[0].daily.at(-1)?.additions, 12);
  assert.equal(report.repositories[0].daily.at(-1)?.commits, 2);
  assert.equal(report.range.start, "2025-10-03");
  assert.equal(queries.length, 2);
  assert.ok(
    queries.every(
      (q) =>
        q.author === "USER" &&
        q.head === "head-alpha" &&
        q.since === "2025-10-03T00:00:00+08:00" &&
        q.until === now.toISOString(),
    ),
  );
  assert.doesNotMatch(COMMITS_QUERY, /\b(message|email|patch|files)\b/);
});

test("單 repo 失敗明示 partial，不採用未完成分頁的統計", async () => {
  const query: Query = async <T>(
    text: string,
    vars: Record<string, unknown>,
  ) => {
    if (text.includes("query Repositories"))
      return viewer([repo("alpha"), repo("beta")]) as T;
    if (vars.name === "beta") throw new Error("測試網路失敗");
    return history([commit]) as T;
  };
  const report = await syncGithub(query, undefined, now);
  assert.equal(report.partial, true);
  assert.equal(report.repositories[1].status, "error");
  assert.equal(report.repositories[1].daily.length, 0);
  assert.equal(report.repositories[1].error, "測試網路失敗");
});

test("commit 游標異常不無限循環，repo 游標異常使同步失敗", async () => {
  const looping: Query = async <T>(
    text: string,
    vars: Record<string, unknown>,
  ) => {
    if (text.includes("query Repositories"))
      return viewer([
        repo("alpha"),
        { ...repo("empty"), defaultBranchRef: null },
      ]) as T;
    assert.equal(vars.head, "head-alpha");
    return history([commit], "same-cursor") as T;
  };
  const result = await syncGithub(looping, undefined, now);
  assert.equal(result.repositories[0].status, "error");
  assert.match(result.repositories[0].error ?? "", /游標/);
  assert.equal(result.repositories[1].status, "empty");
  const badRepo: Query = async <T>() => viewer([repo("alpha")], "same") as T;
  await assert.rejects(() => syncGithub(badRepo, undefined, now), /游標/);
});

test("全域失敗向外拋出，不產生看似成功的空報告", async () => {
  const query: Query = async <T>(text: string) => {
    if (text.includes("query Repositories"))
      return viewer([repo("alpha")]) as T;
    throw new Error("無權限");
  };
  await assert.rejects(
    () => syncGithub(query, undefined, now),
    /所有 repositories 同步失敗/,
  );
});
