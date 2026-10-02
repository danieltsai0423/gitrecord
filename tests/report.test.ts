import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCommits,
  dailyCsv,
  dateRange,
  shiftDate,
  taipeiDate,
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
