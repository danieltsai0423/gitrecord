import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCommits, combineReports, normalizeStore, updateAccount, type Report } from "../shared/report.js";
import { buildReflection, goalScope, shareReflection, weeklyRhythm } from "../shared/reflection.js";

function account(login: string, dates: string[], privateRepo = true): Report {
  return {
    version: 1, user: { id: login + "-id", login, avatarUrl: "", url: `https://github.com/${login}` },
    generatedAt: "2026-10-11T06:00:00Z", timezone: "Asia/Taipei", partial: false, excludedForks: 0,
    range: { start: "2026-09-14", end: "2026-10-11", until: "2026-10-11T06:00:00Z" },
    repositories: [{
      name: "secret-project", fullName: `${login}/secret-project`, url: "", private: privateRepo,
      branch: "main", language: "TypeScript", languageColor: "", status: "complete",
      ...aggregateCommits(dates.map((date, i) => ({ oid: login + i, committedDate: date + "T00:00:00+08:00", additions: i === 1 ? 0 : 10, deletions: 0, parents: { totalCount: 1 } })), "2026-09-14", "2026-10-11"),
    }],
  };
}

const paired = () => combineReports(updateAccount(normalizeStore(account("work-secret", ["2026-09-28", "2026-09-29", "2026-10-01"])), account("personal-secret", ["2026-09-29", "2026-10-02"])))!;

test("回顧跨帳號日期去重、共同活躍日、零行數提交與最長連續日", () => {
  const review = buildReflection(paired(), "2026-09-28", "2026-10-04");
  assert.equal(review.totals.commits, 5);
  assert.equal(review.totals.activeDays, 4);
  assert.equal(review.sharedActiveDays, 1);
  assert.equal(review.longestStreak, 2);
  assert.equal(review.activeRepositories, 2);
  assert.equal(review.peakDay?.date, "2026-09-29");
  assert.deepEqual(review.months.map(({ month, commits }) => [month, commits]), [["2026-09", 3], ["2026-10", 2]]);
  assert.equal(review.previous?.commits, 0);
});

test("同期間帳號對照保持資料日期，repo 篩選只包含所屬帳號", () => {
  const report = paired();
  report.accounts.find((entry) => entry.report.user.login === "personal-secret")!.report.partial = true;
  const review = buildReflection(report, "2026-09-28", "2026-10-04", "work-secret/secret-project");
  assert.equal(review.accounts.length, 1);
  assert.equal(review.accounts[0].login, "work-secret");
  assert.equal(review.complete, true);
  assert.equal(review.longestStreak, 2);
  assert.equal(review.totals.commits, 3);
});

test("範圍缺漏、partial 與保存失敗不偽裝完整紀錄或前期比較", () => {
  for (const variant of ["range", "partial", "failure"] as const) {
    const report = paired();
    const account = report.accounts[0];
    if (variant === "range") {
      account.report.range.start = "2026-09-30";
      account.report.repositories[0].daily = account.report.repositories[0].daily.filter((day) => day.date >= "2026-09-30");
    } else if (variant === "partial") account.report.partial = true;
    else account.syncError = "network unavailable";
    const review = buildReflection(report, "2026-09-28", "2026-10-04");
    assert.equal(review.complete, false);
    assert.equal(review.longestStreak, null);
    assert.equal(review.previous, null);
    assert.equal(review.accounts[0].daily[0].known, false);
    assert.equal(review.accounts[1].complete, true);
  }
});

test("前期等長比較只在兩期已覆蓋時成立", () => {
  const report = paired();
  const review = buildReflection(report, "2026-10-01", "2026-10-02");
  assert.equal(review.previous?.commits, 2);
  report.accounts[0].report.range.start = "2026-10-01";
  assert.equal(buildReflection(report, "2026-10-01", "2026-10-02").previous, null);
});

test("週一開始、截至選取日，跨帳號活躍日只算一次，週末與跨年正確", () => {
  const report = paired();
  const friday = weeklyRhythm(report, "2026-10-02");
  assert.equal(friday.start, "2026-09-28");
  assert.equal(friday.end, "2026-10-04");
  assert.equal(friday.activeDays, 4);
  assert.deepEqual(friday.days.slice(5).map((day) => day.state), ["outside", "outside"]);
  assert.equal(weeklyRhythm(report, "2026-10-04").days[6].state, "quiet");
  assert.equal(weeklyRhythm(report, "2026-10-05").start, "2026-10-05");
  const newYear = weeklyRhythm(report, "2026-01-01");
  assert.equal(newYear.start, "2025-12-29");
  assert.equal(newYear.complete, false);
  assert.equal(newYear.days[0].state, "unknown");
});

test("無活動為零，缺資料仍保留已確認的週活動與保守進度", () => {
  const empty = combineReports(normalizeStore(account("empty", [])))!;
  const review = buildReflection(empty, "2026-10-01", "2026-10-04");
  assert.equal(review.longestStreak, 0);
  assert.equal(review.peakDay, null);
  assert.equal(review.topRepos.length, 0);
  const report = paired();
  report.accounts[0].report.partial = true;
  const week = weeklyRhythm(report, "2026-10-04");
  assert.equal(week.complete, false);
  assert.equal(week.activeDays, 4);
  assert.equal(week.days[2].state, "unknown");
});

test("匯出先遮名，帳號、私人 repo 及篩選名稱不殘留；公開專案保留 basename", () => {
  const report = paired();
  const review = buildReflection(report, "2026-09-28", "2026-10-04", "work-secret/secret-project");
  const redacted = JSON.stringify(shareReflection(review));
  assert.doesNotMatch(redacted, /work-secret|personal-secret|secret-project/);
  assert.match(JSON.stringify(shareReflection(review, false)), /work-secret\/secret-project/);
  report.accounts.find((entry) => entry.report.user.login === "work-secret")!.report.repositories[0].private = false;
  assert.equal(shareReflection(buildReflection(report, "2026-09-28", "2026-10-04")).repositories[0].name, "secret-project");
  assert.equal(shareReflection(review).accounts[0].generatedAt, "2026-10-11T06:00:00Z");
});

test("單帳號目標依 GitHub ID 保存，可沿用更名後設定", () => {
  const report = combineReports(normalizeStore(account("before", [])))!;
  const scope = goalScope(report);
  report.accounts[0].report.user.login = "after";
  assert.equal(goalScope(report), scope);
  assert.equal(goalScope(paired()), "combined");
});
