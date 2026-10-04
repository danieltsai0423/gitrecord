import { dateRange, emptyDay, shiftDate, totals, viewReport, type AccountReport, type CombinedReport, type DailyStat } from "./report.js";

export interface ObservedDay extends DailyStat { known: boolean }

function accountsInScope(report: CombinedReport, repository: string) {
  return report.accounts.filter(({ report }) => repository === "all" || report.repositories.some((repo) => repo.fullName === repository));
}

function observedDays(accounts: AccountReport[], start: string, end: string, repository = "all"): ObservedDay[] {
  const days = dateRange(start, end).map((date) => ({ ...emptyDay(date), known: accounts.length > 0 }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const account of accounts) {
    const report = account.report;
    const repos = report.repositories.filter((repo) => repository === "all" || repo.fullName === repository);
    for (const day of days) {
      day.known &&= day.date >= report.range.start && day.date <= report.range.end &&
        !report.partial && !account.syncError && repos.every((repo) => repo.status !== "error");
    }
    for (const repo of repos) {
      if (repo.status === "error") continue;
      for (const source of repo.daily) {
        const day = byDate.get(source.date);
        if (!day || source.date < report.range.start || source.date > report.range.end) continue;
        day.additions += source.additions;
        day.deletions += source.deletions;
        day.commits += source.commits;
        day.changed = day.additions + day.deletions;
        day.net = day.additions - day.deletions;
      }
    }
  }
  return days;
}

export function buildReflection(report: CombinedReport, start: string, end: string, repository = "all") {
  const view = viewReport(report, start, end, repository);
  const scope = accountsInScope(report, repository);
  const daily = observedDays(scope, start, end, repository);
  const complete = daily.every((day) => day.known);
  const rows = scope.map((account) => {
    const daily = observedDays([account], start, end, repository);
    return {
      login: account.report.user.login,
      generatedAt: account.report.generatedAt,
      range: account.report.range,
      daily,
      totals: totals(daily),
      complete: daily.every((day) => day.known),
    };
  });
  let run = 0, longest = 0;
  for (const day of daily) {
    run = day.commits > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const previousStart = shiftDate(start, -daily.length);
  const previousEnd = shiftDate(start, -1);
  const previous = complete && previousStart >= report.range.start
    ? observedDays(scope, previousStart, previousEnd, repository)
    : null;
  const months = new Map<string, ObservedDay[]>();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), day]);
  }
  const peakDay = daily.filter((day) => day.commits > 0).sort((a, b) => b.commits - a.commits || b.changed - a.changed || a.date.localeCompare(b.date))[0] ?? null;
  const activeRepos = view.repositories.filter((repo) => repo.status !== "error" && repo.totals.commits > 0);
  return {
    start, end, repository, daily, complete, accounts: rows,
    scopedRepository: repository === "all" ? null : view.repositories[0],
    totals: totals(daily),
    topRepos: activeRepos.sort((a, b) => b.totals.changed - a.totals.changed || b.totals.commits - a.totals.commits || a.fullName.localeCompare(b.fullName)),
    activeRepositories: activeRepos.length,
    longestStreak: complete ? longest : null,
    sharedActiveDays: daily.filter((_, i) => rows.filter((row) => row.daily[i].commits > 0).length > 1).length,
    previous: previous?.every((day) => day.known) ? totals(previous) : null,
    months: [...months].map(([month, days]) => ({ month, ...totals(days), complete: days.every((day) => day.known) })),
    peakDay,
  };
}

export type Reflection = ReturnType<typeof buildReflection>;

export function weeklyRhythm(report: CombinedReport, through: string) {
  const weekday = new Date(`${through}T00:00:00Z`).getUTCDay();
  const start = shiftDate(through, -((weekday + 6) % 7));
  const end = shiftDate(start, 6);
  const days = observedDays(report.accounts, start, end).map((day) => ({
    ...day,
    state: day.date > through ? "outside" as const : day.commits > 0 ? "active" as const : day.known ? "quiet" as const : "unknown" as const,
  }));
  return {
    start, end, through, days,
    activeDays: days.filter((day) => day.state === "active").length,
    complete: days.filter((day) => day.date <= through).every((day) => day.known),
  };
}

export function goalScope(report: CombinedReport) {
  return report.accounts.length === 1
    ? `account:${report.accounts[0].report.user.id ?? report.accounts[0].report.user.login.toLowerCase()}`
    : "combined";
}

// This is the only data passed to image / Markdown exporters. Redaction occurs
// before formatting so a hidden name cannot survive in alt text or metadata.
export function shareReflection(review: Reflection, hideNames = true) {
  return {
    start: review.start, end: review.end, complete: review.complete,
    totals: review.totals, longestStreak: review.longestStreak,
    activeRepositories: review.activeRepositories,
    repository: review.scopedRepository ? {
      name: hideNames ? review.scopedRepository.private ? null : review.scopedRepository.name : review.scopedRepository.fullName,
      private: review.scopedRepository.private, index: 1,
    } : null,
    months: review.months,
    accounts: review.accounts.map((account, i) => ({
      name: hideNames ? null : account.login, index: i + 1,
      generatedAt: account.generatedAt, complete: account.complete,
      start: account.range.start, end: account.range.end,
    })),
    repositories: review.topRepos.slice(0, 3).map((repo, i) => ({
      name: hideNames ? repo.private ? null : repo.name : repo.fullName,
      index: i + 1, private: repo.private, changed: repo.totals.changed, commits: repo.totals.commits,
    })),
  };
}

export type ShareReflection = ReturnType<typeof shareReflection>;
