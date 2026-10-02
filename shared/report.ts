export interface CommitStat {
  oid: string;
  committedDate: string;
  additions: number;
  deletions: number;
  parents: { totalCount: number };
}

export interface DailyStat {
  date: string;
  additions: number;
  deletions: number;
  commits: number;
  net: number;
  changed: number;
}

export interface RepositoryReport {
  name: string;
  fullName: string;
  url: string;
  private: boolean;
  branch: string | null;
  language: string | null;
  languageColor: string | null;
  status: "complete" | "empty" | "error";
  error?: string;
  excludedMerges: number;
  daily: DailyStat[];
}

export interface Report {
  version: 1;
  user: { login: string; avatarUrl: string; url: string };
  generatedAt: string;
  range: { start: string; end: string; until: string };
  timezone: "Asia/Taipei";
  partial: boolean;
  excludedForks: number;
  repositories: RepositoryReport[];
}

export interface SyncStatus {
  running: boolean;
  completed: number;
  total: number;
  current: string;
  error: string | null;
}

export function taipeiDate(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("無效的提交時間");
  return new Date(date.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("無效的日期");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("無效的日期");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function dateRange(start: string, end: string): string[] {
  shiftDate(start, 0);
  shiftDate(end, 0);
  if (start > end) throw new Error("開始日期不能晚於結束日期");
  const count =
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86400000,
    ) + 1;
  if (count > 366) throw new Error("最多支援 366 日");
  return Array.from({ length: count }, (_, index) => shiftDate(start, index));
}

export function emptyDay(date: string): DailyStat {
  return { date, additions: 0, deletions: 0, commits: 0, net: 0, changed: 0 };
}

export function aggregateCommits(
  commits: CommitStat[],
  start: string,
  end: string,
) {
  const days = new Map(
    dateRange(start, end).map((date) => [date, emptyDay(date)]),
  );
  const seen = new Set<string>();
  let excludedMerges = 0;
  for (const commit of commits) {
    if (seen.has(commit.oid)) continue;
    seen.add(commit.oid);
    const day = days.get(taipeiDate(commit.committedDate));
    if (!day) continue;
    if (commit.parents.totalCount > 1) {
      excludedMerges++;
      continue;
    }
    if (
      !Number.isSafeInteger(commit.additions) ||
      commit.additions < 0 ||
      !Number.isSafeInteger(commit.deletions) ||
      commit.deletions < 0
    ) {
      throw new Error("GitHub 回傳無效的行數");
    }
    day.additions += commit.additions;
    day.deletions += commit.deletions;
    day.commits++;
    day.net = day.additions - day.deletions;
    day.changed = day.additions + day.deletions;
  }
  return { daily: [...days.values()], excludedMerges };
}

export function totals(days: DailyStat[]) {
  return days.reduce(
    (acc, day) => ({
      additions: acc.additions + day.additions,
      deletions: acc.deletions + day.deletions,
      commits: acc.commits + day.commits,
      net: acc.net + day.net,
      changed: acc.changed + day.changed,
      activeDays: acc.activeDays + (day.commits > 0 ? 1 : 0),
    }),
    {
      additions: 0,
      deletions: 0,
      commits: 0,
      net: 0,
      changed: 0,
      activeDays: 0,
    },
  );
}

export function viewReport(
  report: Report,
  start: string,
  end: string,
  repository = "all",
) {
  if (start < report.range.start || end > report.range.end)
    throw new Error("日期超出資料涵蓋範圍");
  const days = new Map(
    dateRange(start, end).map((date) => [date, emptyDay(date)]),
  );
  const repos = report.repositories.filter(
    (repo) => repository === "all" || repo.fullName === repository,
  );
  if (repository !== "all" && repos.length === 0)
    throw new Error("找不到指定的 repository");
  const ranked = repos
    .map((repo) => {
      const filtered = repo.daily.filter(
        (day) => day.date >= start && day.date <= end,
      );
      for (const source of filtered) {
        const day = days.get(source.date);
        if (!day) continue;
        day.additions += source.additions;
        day.deletions += source.deletions;
        day.commits += source.commits;
        day.net = day.additions - day.deletions;
        day.changed = day.additions + day.deletions;
      }
      return { ...repo, totals: totals(filtered) };
    })
    .sort(
      (a, b) =>
        b.totals.changed - a.totals.changed || a.name.localeCompare(b.name),
    );
  const daily = [...days.values()];
  return {
    daily,
    totals: totals(daily),
    repositories: ranked,
    peak: daily.reduce(
      (peak, day) => (day.changed > peak.changed ? day : peak),
      emptyDay(start),
    ),
  };
}

export function dailyCsv(
  report: Report,
  start: string,
  end: string,
  repository = "all",
): string {
  const scope = repository === "all" ? "all repositories" : repository;
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = viewReport(report, start, end, repository).daily.map((day) =>
    [
      day.date,
      report.user.login,
      scope,
      day.additions,
      day.deletions,
      day.net,
      day.changed,
      day.commits,
      report.timezone,
      report.partial ? "partial" : "complete",
      report.generatedAt,
    ]
      .map((value) =>
        typeof value === "number" ? String(value) : escape(value),
      )
      .join(","),
  );
  return (
    "\uFEFF" +
    [
      "date,account,repository,additions,deletions,net,changed,commits,timezone,coverage,synced_at",
      ...rows,
    ].join("\r\n")
  );
}
