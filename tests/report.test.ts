import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCommits,
  accountFailure,
  combineReports,
  coverageFor,
  dailyCsv,
  dateRange,
  shiftDate,
  taipeiDate,
  normalizeStore,
  updateAccount,
  viewReport,
  type CommitStat,
  type Report,
} from "../shared/report.js";

const commit = (
  oid: string,
  committedDate: string,
  additions: number,
  deletions: number,
  parents = 1,
): CommitStat => ({
  oid,
  committedDate,
  additions,
  deletions,
  parents: { totalCount: parents },
});

function otherSample(): Report {
  const report = sample();
  report.user = { id: "OTHER", login: "other", avatarUrl: "", url: "https://github.com/other" };
  report.repositories = report.repositories.map((repo) => ({ ...repo, fullName: `other/${repo.name}` }));
  return report;
}

test("舊快取轉換、多帳號合計、活躍日期去重與同名 repo 篩選", () => {
  const old = sample();
  const store = updateAccount(normalizeStore(old), otherSample());
  assert.equal(store.accounts.length, 2);
  const report = combineReports(store)!;
  const view = viewReport(report, "2026-10-01", "2026-10-02");
  assert.equal(view.totals.additions, 60);
  assert.equal(view.totals.deletions, 6);
  assert.equal(view.totals.commits, 4);
  assert.equal(view.totals.activeDays, 1);
  assert.equal(viewReport(report, "2026-10-02", "2026-10-02", "other/alpha").totals.additions, 10);
  assert.equal(viewReport(combineReports(store, "other")!, "2026-10-01", "2026-10-02").totals.additions, 30);
  assert.equal(combineReports(store, "unknown"), null);
  assert.match(dailyCsv(report, "2026-10-01", "2026-10-02"), /example; other/);
  const scopedCsv = dailyCsv(report, "2026-10-02", "2026-10-02", "other/alpha");
  assert.match(scopedCsv, /"other","other\/alpha",10,1/);
  assert.doesNotMatch(scopedCsv, /example=/);
  assert.throws(() => normalizeStore({ version: 2, accounts: [old] }), /快取格式無效/);
});

test("再同步取代單一帳號、保留其他帳號；帳號更名依 GitHub ID 更新", () => {
  const first = sample();
  first.user.id = "FIRST";
  const store = updateAccount(normalizeStore(first), otherSample());
  const renamed = { ...first, user: { ...first.user, login: "renamed" } };
  const next = updateAccount(store, renamed);
  assert.equal(next.accounts.length, 2);
  assert.equal(next.accounts.find((a) => a.report.user.id === "FIRST")?.report.user.login, "renamed");
  assert.deepEqual(next.accounts.find((a) => a.report.user.id === "OTHER"), store.accounts.find((a) => a.report.user.id === "OTHER"));
  assert.equal(viewReport(combineReports(next)!, "2026-10-01", "2026-10-02").totals.additions, 60);
  const legacy = updateAccount(normalizeStore(sample()), first);
  assert.equal(legacy.accounts.length, 1);
  assert.equal(legacy.accounts[0].report.user.id, "FIRST");
});

test("不同同步日期與失敗帳號明示 partial，舊資料保留且可恢復", () => {
  const older = sample();
  older.range.end = "2026-10-01";
  older.repositories.forEach((repo) => { repo.daily = repo.daily.filter((day) => day.date <= older.range.end); });
  let store = updateAccount(normalizeStore(older), otherSample());
  const merged = combineReports(store)!;
  assert.equal(coverageFor(merged, "2026-10-01", "2026-10-02").partial, true);
  assert.equal(coverageFor(merged, "2026-10-01", "2026-10-02", "other/alpha").partial, false);
  assert.match(dailyCsv(merged, "2026-10-01", "2026-10-02"), /"partial"/);
  store = accountFailure(store, otherSample().user, "網路失敗", "2026-10-03T01:00:00Z");
  assert.equal(store.accounts.find((a) => a.report.user.login === "other")?.syncError, "網路失敗");
  assert.equal(viewReport(combineReports(store, "other")!, "2026-10-01", "2026-10-02").totals.additions, 30);
  assert.match(dailyCsv(combineReports(store, "other")!, "2026-10-01", "2026-10-02"), /other: 網路失敗/);
  store = updateAccount(store, otherSample());
  assert.equal(combineReports(store, "other")?.partial, false);
});

test("多年未同步帳號不使合計期間超過一年，也不偽裝完整涵蓋", () => {
  const ancient = sample();
  ancient.range = { start: "2020-10-01", end: "2020-10-02", until: "2020-10-02T06:00:00Z" };
  ancient.repositories = [];
  const report = combineReports(updateAccount(normalizeStore(ancient), otherSample()))!;
  assert.equal(dateRange(report.range.start, report.range.end).length, 365);
  assert.equal(coverageFor(report, report.range.start, report.range.end).partial, true);
});
const sample = (): Report => ({
  version: 1,
  user: { login: "example", avatarUrl: "", url: "https://github.com/example" },
  generatedAt: "2026-10-02T06:00:00Z",
  timezone: "Asia/Taipei",
  partial: false,
  excludedForks: 1,
  range: {
    start: "2026-10-01",
    end: "2026-10-02",
    until: "2026-10-02T06:00:00Z",
  },
  repositories: ["alpha", "beta"].map((name, i) => ({
    name,
    fullName: `example/${name}`,
    url: "",
    private: true,
    branch: "main",
    language: null,
    languageColor: null,
    status: "complete",
    ...aggregateCommits(
      [commit(name, "2026-10-01T16:00:00Z", (i + 1) * 10, i + 1)],
      "2026-10-01",
      "2026-10-02",
    ),
  })),
});

test("台北零點準確歸日，閏日與跨年連續", () => {
  assert.equal(taipeiDate("2026-10-01T15:59:59Z"), "2026-10-01");
  assert.equal(taipeiDate("2026-10-01T16:00:00Z"), "2026-10-02");
  assert.deepEqual(dateRange("2024-02-28", "2024-03-01"), [
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.throws(() => dateRange("2026-02-30", "2026-03-01"));
  assert.throws(() => dateRange("2026-10-02", "2026-10-01"));
});

test("去重、排除 merge、根 commit 保留、無活動補零與期間外排除", () => {
  const first = commit("a", "2026-10-01T16:00:00Z", 10, 3, 0);
  const result = aggregateCommits(
    [
      first,
      first,
      commit("b", "2026-10-02T00:00:00Z", 100, 90, 2),
      commit("c", "2026-09-01T00:00:00Z", 7, 0),
    ],
    "2026-10-01",
    "2026-10-02",
  );
  assert.equal(result.excludedMerges, 1);
  assert.deepEqual(result.daily[0], {
    date: "2026-10-01",
    additions: 0,
    deletions: 0,
    net: 0,
    changed: 0,
    commits: 0,
  });
  assert.deepEqual(result.daily[1], {
    date: "2026-10-02",
    additions: 10,
    deletions: 3,
    net: 7,
    changed: 13,
    commits: 1,
  });
});

test("repo／日期篩選與 CSV 合計一致，越界拒絕", () => {
  const report = sample();
  assert.equal(
    viewReport(report, "2026-10-01", "2026-10-02").totals.additions,
    30,
  );
  const view = viewReport(report, "2026-10-02", "2026-10-02", "example/beta");
  assert.deepEqual(view.totals, {
    additions: 20,
    deletions: 2,
    net: 18,
    changed: 22,
    commits: 1,
    activeDays: 1,
  });
  assert.match(
    dailyCsv(report, "2026-10-02", "2026-10-02", "example/beta"),
    /,20,2,18,22,1,/,
  );
  assert.throws(() => viewReport(report, "2026-09-30", "2026-10-02"));
  assert.throws(() =>
    viewReport(report, "2026-10-01", "2026-10-02", "unknown"),
  );
});

test("錯誤 repo 不偽裝舊資料，零行數 commit 算活動，負行數拒絕", () => {
  const report = sample();
  report.partial = true;
  report.repositories[0].status = "error";
  report.repositories[0].daily = [];
  assert.equal(
    viewReport(report, "2026-10-01", "2026-10-02").totals.additions,
    20,
  );
  assert.match(dailyCsv(report, "2026-10-01", "2026-10-02"), /"partial"/);
  assert.equal(
    aggregateCommits(
      [commit("zero", "2026-10-02T00:00:00Z", 0, 0)],
      "2026-10-02",
      "2026-10-02",
    ).daily[0].commits,
    1,
  );
  assert.throws(() =>
    aggregateCommits(
      [commit("bad", "2026-10-02T00:00:00Z", -1, 0)],
      "2026-10-02",
      "2026-10-02",
    ),
  );
});
