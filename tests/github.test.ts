import test from "node:test";
import assert from "node:assert/strict";
import { COMMITS_QUERY, createGithubQuery, syncGithub, type Query } from "../server/github.js";

const repo = (name: string, isFork = false) => ({
  name,
  nameWithOwner: `example/${name}`,
  url: `https://github.com/example/${name}`,
  isPrivate: true,
  isFork,
  primaryLanguage: null,
  defaultBranchRef: { name: "main", target: { oid: `head-${name}` } },
});

test("直接 GraphQL 傳送 Bearer token 與 variables，錯誤不輸出 token 或原始回應", async () => {
  const calls: RequestInit[] = [];
  const query = createGithubQuery(async () => "PRIVATE-TOKEN", async (url, options) => {
    assert.equal(url, "https://api.github.com/graphql");
    calls.push(options!);
    return Response.json({ data: { count: 3 } });
  });
  assert.deepEqual(await query("query Count", { cursor: "next" }), { count: 3 });
  assert.equal(new Headers(calls[0].headers).get("Authorization"), "Bearer PRIVATE-TOKEN");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { query: "query Count", variables: { cursor: "next" } });
  assert.equal(calls[0].redirect, "error");
  for (const status of [401, 403, 429]) {
    const failure = createGithubQuery(async () => "PRIVATE-TOKEN", async () => Response.json({ message: "PRIVATE-TOKEN", errors: [{ message: "SECRET" }] }, { status }));
    await assert.rejects(() => failure("query", {}), (error: Error) => !/PRIVATE-TOKEN|SECRET/.test(error.message));
  }
});

test("GraphQL 回應過大或 JSON 無效時安全中止", async () => {
  const large = createGithubQuery(async () => "PRIVATE-TOKEN", async () => new Response("x".repeat(8 * 1024 * 1024 + 1)));
  await assert.rejects(() => large("query", {}), /回應過大/);
  const invalid = createGithubQuery(async () => "PRIVATE-TOKEN", async () => new Response("SECRET"));
  await assert.rejects(() => invalid("query", {}), /無效資料/);
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
  viewer: { id: "USER" },
  repository: {
    object: {
      history: {
        nodes,
        pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor },
      },
    },
  },
});

test("同步途中切換帳號會中止整份報告，不保存混合帳號的資料", async () => {
  const query: Query = async <T>(text: string) => {
    if (text.includes("query Repositories")) return viewer([repo("alpha")]) as T;
    return { ...history([commit]), viewer: { id: "OTHER" } } as T;
  };
  await assert.rejects(() => syncGithub(query, undefined, now), /帳號變更/);
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

test("安裝白名單分批查詢，不列出所有公開 repos，仍依作者與固定 HEAD 統計", async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `R_${i}`);
  const batches: string[][] = [];
  const query: Query = async <T>(text: string, vars: Record<string, unknown>) => {
    if (text.includes("query SelectedRepositories")) {
      assert.doesNotMatch(text, /repositories\(first/);
      const selected = vars.ids as string[]; batches.push(selected);
      return { viewer: viewer([]).viewer, nodes: selected.map((id) => ({ ...repo(id), owner: { login: "example" } })) } as T;
    }
    assert.equal(vars.author, "USER");
    assert.equal(vars.head, `head-${vars.name}`);
    assert.ok(ids.includes(String(vars.name)));
    return history([commit]) as T;
  };
  const report = await syncGithub(query, undefined, now, [...ids, ids[0]]);
  assert.deepEqual(batches.map((batch) => batch.length), [50, 1]);
  assert.deepEqual(batches.flat(), ids);
  assert.equal(report.repositories.length, 51);
  assert.ok(report.repositories.every((entry) => entry.daily.reduce((sum, day) => sum + day.commits, 0) === 1));
});

test("被移除的 repo 或其他帳號的白名單資料使同步失敗", async () => {
  for (const node of [null, { ...repo("other"), owner: { login: "different" } }]) {
    const query: Query = async <T>() => ({ viewer: viewer([]).viewer, nodes: [node] }) as T;
    await assert.rejects(() => syncGithub(query, undefined, now, ["R_ALLOWED"]));
  }
});
