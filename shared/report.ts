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
  user: { id?: string; login: string; avatarUrl: string; url: string };
  generatedAt: string;
  range: { start: string; end: string; until: string };
  timezone: "Asia/Taipei";
  partial: boolean;
  excludedForks: number;
  repositories: RepositoryReport[];
}

export interface AccountReport {
  report: Report;
  lastAttemptAt: string;
  syncError: string | null;
}

export interface ReportStore {
  version: 2;
  accounts: AccountReport[];
}

export type CombinedReport = Omit<Report, "version" | "user"> & {
  accounts: AccountReport[];
};

export function normalizeStore(value: unknown): ReportStore {
  const input = value as Report | ReportStore | null;
  const accounts =
    input?.version === 1
      ? [{ report: input, lastAttemptAt: input.generatedAt, syncError: null }]
      : input?.version === 2
        ? input.accounts
        : null;
  if (
    !Array.isArray(accounts) ||
    accounts.some((account) => {
      const report = account?.report;
      return (
        !report || report.version !== 1 || report.timezone !== "Asia/Taipei" ||
        !report.user?.login || !Array.isArray(report.repositories) ||
        !report.range?.start || !report.range?.end || !report.generatedAt ||
        typeof account.lastAttemptAt !== "string" ||
        !(account.syncError === null || typeof account.syncError === "string")
      );
    })
  )
    throw new Error("快取格式無效；請將 .cache/report.json 移至備份位置後重新同步。");
  const identities = new Set<string>();
  for (const { report } of accounts) {
    dateRange(report.range.start, report.range.end);
    const key = report.user.id ?? report.user.login.toLowerCase();
    if (identities.has(key))
      throw new Error("快取包含重複帳號，請先備份後重新同步。");
    identities.add(key);
  }
  return { version: 2, accounts };
}

function sameAccount(a: Report["user"], b: Report["user"]) {
  return a.id && b.id
    ? a.id === b.id
    : a.login.toLowerCase() === b.login.toLowerCase();
}

export function updateAccount(store: ReportStore, report: Report): ReportStore {
  const account: AccountReport = {
    report,
    lastAttemptAt: report.generatedAt,
    syncError: null,
  };
  const accounts = store.accounts.filter(
    (entry) => !sameAccount(entry.report.user, report.user),
  );
  accounts.push(account);
  accounts.sort((a, b) => a.report.user.login.localeCompare(b.report.user.login));
  return { version: 2, accounts };
}

export function accountFailure(
  store: ReportStore,
  user: Report["user"],
  error: string,
  at: string,
): ReportStore {
  return {
    version: 2,
    accounts: store.accounts.map((account) =>
      sameAccount(account.report.user, user)
        ? { ...account, lastAttemptAt: at, syncError: error }
        : account,
    ),
  };
}

export function combineReports(
  store: ReportStore,
  login = "all",
): CombinedReport | null {
  const accounts = store.accounts.filter(
    ({ report }) => login === "all" || report.user.login === login,
  );
  if (!accounts.length) return null;
  const reports = accounts.map((account) => account.report);
  const end = reports.map((report) => report.range.end).sort().at(-1)!;
  // Bound the union to one year even when an account has not synced for years.
  const earliest = reports.map((report) => report.range.start).sort()[0];
  const start = [shiftDate(end, -364), earliest].sort().at(-1)!;
  return {
    accounts,
    generatedAt: reports.map((report) => report.generatedAt).sort().at(-1)!,
    range: {
      start, end,
      until: reports.map((report) => report.range.until).sort().at(-1)!,
    },
    timezone: "Asia/Taipei",
    partial: accounts.some(
      (account) => account.report.partial || account.syncError !== null,
    ),
    excludedForks: reports.reduce((sum, report) => sum + report.excludedForks, 0),
    repositories: reports.flatMap((report) => report.repositories),
  };
}

function scopedAccounts(
  report: Report | CombinedReport,
  repository: string,
): AccountReport[] {
  const accounts = "accounts" in report
    ? report.accounts
    : [{ report, lastAttemptAt: report.generatedAt, syncError: null }];
  return accounts.filter((account) =>
    repository === "all" ||
    account.report.repositories.some((repo) => repo.fullName === repository),
  );
}

export function coverageFor(
  report: Report | CombinedReport,
  start: string,
  end: string,
  repository = "all",
) {
  const accounts = scopedAccounts(report, repository);
  return {
    accounts,
    partial: accounts.some(({ report, syncError }) =>
      report.partial || syncError !== null ||
      start < report.range.start || end > report.range.end,
    ),
  };
}

export interface SyncStatus {
  running: boolean;
  completed: number;
  total: number;
  current: string;
  error: string | null;
  account?: string | null;
}

export interface AuthAccount {
  login: string;
  active: boolean;
  state: string;
}

export interface AuthStatus {
  accounts: AuthAccount[];
  running: boolean;
  operation: "login" | "switch" | "refresh" | null;
  code: string | null;
  verificationUrl: string | null;
  error: string | null;
  message: string | null;
  configuration?: { clientId: string; appId: string; appUrl: string; configured: boolean; storage: "keychain" | "session" };
  installation?: InstallationStatus | null;
}

export interface InstallationStatus {
  state: "unknown" | "missing" | "ready" | "suspended" | "permissions" | "empty";
  url: string;
  repositoryCount: number;
  selection: "all" | "selected" | null;
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
  report: Report | CombinedReport,
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
  report: Report | CombinedReport,
  start: string,
  end: string,
  repository = "all",
): string {
  const scope = repository === "all" ? "all repositories" : repository;
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const coverage = coverageFor(report, start, end, repository);
  const accountNames = coverage.accounts.map((account) => account.report.user.login).join("; ");
  const syncTimes = coverage.accounts.map((account) =>
    `${account.report.user.login}=${account.report.generatedAt}`).join("; ");
  const ranges = coverage.accounts.map((account) =>
    `${account.report.user.login}=${account.report.range.start}..${account.report.range.end}`).join("; ");
  const errors = coverage.accounts.filter((account) => account.syncError).map((account) =>
    `${account.report.user.login}: ${account.syncError}`).join("; ");
  const rows = viewReport(report, start, end, repository).daily.map((day) =>
    [
      day.date,
      accountNames,
      scope,
      day.additions,
      day.deletions,
      day.net,
      day.changed,
      day.commits,
      report.timezone,
      coverage.partial ? "partial" : "complete",
      syncTimes,
      ranges,
      errors,
    ]
      .map((value) =>
        typeof value === "number" ? String(value) : escape(value),
      )
      .join(","),
  );
  return (
    "\uFEFF" +
    [
      "date,account,repository,additions,deletions,net,changed,commits,timezone,coverage,synced_at,account_ranges,sync_errors",
      ...rows,
    ].join("\r\n")
  );
}
