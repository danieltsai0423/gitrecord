import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsDiff,
  IconBrandGithub,
  IconCalendar,
  IconChartArcs,
  IconChartLine,
  IconDownload,
  IconGitCommit,
  IconGitBranch,
  IconLayoutDashboard,
  IconRefresh,
  IconPrinter,
  IconCircleCheck,
  IconAlertTriangle,
  IconActivity,
  IconInfoCircle,
  IconChevronDown,
  IconSun,
  IconMoon,
  IconNotebook,
} from "@tabler/icons-react";
import { combineReports, coverageFor, dailyCsv, shiftDate, viewReport } from "../shared/report";
import { useReport } from "./useReport";
import { useAuth } from "./useAuth";
import { Heatmap } from "./components/Heatmap";
import { RepositoryList } from "./components/RepositoryList";
import { AccountPanel } from "./components/AccountPanel";
import { CoverageNotice } from "./components/CoverageNotice";
import { ReflectionWorkspace } from "./components/ReflectionWorkspace";
import { readTheme, saveTheme } from "./theme";
import { useLanguage } from "./i18n";
import "./reflection.css";

const TrendChart = lazy(() =>
  import("./components/TrendChart").then((module) => ({
    default: module.TrendChart,
  })),
);

export default function App() {
  const { language, locale, t, number, shortDate, syncTime, message, toggleLanguage } = useLanguage();
  const signed = (value: number) => `${value < 0 ? "−" : "+"}${number(Math.abs(value))}`;
  const [theme, setTheme] = useState(readTheme);
  const themeLabel = t(theme === "dark" ? "切換為淺色模式" : "切換為深色模式");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };
  const { store, loading, status, error, sync } = useReport();
  const auth = useAuth();
  const initialSync = useRef(false);
  const syncedAuthVersion = useRef(0);
  const activeLogin = auth.status.accounts.find((entry) => entry.active)?.login;
  const authBusy = auth.loading || auth.status.running;
  const connectionReady = auth.status.installation?.state === "ready";
  useEffect(() => {
    if (auth.connectedVersion > syncedAuthVersion.current) {
      syncedAuthVersion.current = auth.connectedVersion;
      initialSync.current = true;
      void sync();
    }
  }, [auth.connectedVersion, sync]);
  useEffect(() => {
    if (!loading && !authBusy && activeLogin && connectionReady && !store?.accounts.length &&
      !status.running && !error && !initialSync.current) {
      initialSync.current = true;
      void sync();
    }
  }, [loading, authBusy, activeLogin, connectionReady, store, status.running, error, sync]);
  const [account, setAccount] = useState("all");
  const selectedAccount = store?.accounts.some((entry) => entry.report.user.login === account) ? account : "all";
  const report = useMemo(() => store ? combineReports(store, selectedAccount) : null, [store, selectedAccount]);
  const user = report?.accounts.length === 1 ? report.accounts[0].report.user : null;
  const profileLogin = selectedAccount !== "all" ? selectedAccount : activeLogin ?? user?.login;
  const profileUrl = profileLogin ? `https://github.com/${encodeURIComponent(profileLogin)}` : "https://github.com";
  const profileLabel = profileLogin
    ? `${t("開啟 {login} 的 GitHub 個人頁", { login: profileLogin })}${selectedAccount === "all" && activeLogin ? t("（目前授權帳號）") : ""}`
    : t("開啟 GitHub");
  const accountLabel = report?.accounts.map((entry) => entry.report.user.login).join(" + ") ?? t("GitHub 帳號");
  const [period, setPeriod] = useState(30);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [repository, setRepository] = useState("all");
  const [showAllDays, setShowAllDays] = useState(false);
  const [nav, setNav] = useState("overview");
  const clampDate = (date: string) =>
    report
      ? [report.range.start, [date, report.range.end].sort()[0]].sort()[1]
      : "";
  const end = report
    ? period
      ? report.range.end
      : clampDate(customEnd || report.range.end)
    : "";
  const start = report
    ? period
      ? [shiftDate(end, -(period - 1)), report.range.start].sort().at(-1)!
      : [clampDate(customStart || report.range.start), end].sort()[0]
    : "";
  const selectedRepo = report?.repositories.some(
    (repo) => repo.fullName === repository,
  )
    ? repository
    : "all";
  const view = useMemo(
    () => (report ? viewReport(report, start, end, selectedRepo) : null),
    [report, start, end, selectedRepo],
  );
  const coverage = report ? coverageFor(report, start, end, selectedRepo) : null;
  const missingCoverage = coverage?.accounts.filter(({ report }) => start < report.range.start || end > report.range.end) ?? [];
  const annual = useMemo(
    () =>
      report
        ? viewReport(report, report.range.start, report.range.end, selectedRepo)
        : null,
    [report, selectedRepo],
  );
  const comparison = useMemo(() => {
    if (!report || !view) return null;
    const previousStart = shiftDate(start, -view.daily.length),
      previousEnd = shiftDate(start, -1);
    if (previousStart < report.range.start) return null;
    if (coverageFor(report, start, end, selectedRepo).partial ||
      coverageFor(report, previousStart, previousEnd, selectedRepo).partial) return null;
    return viewReport(report, previousStart, previousEnd, selectedRepo).totals;
  }, [report, view, start, selectedRepo]);
  const failedRepos =
    report?.repositories.filter((repo) => repo.status === "error") ?? [];
  const selectDay = (date: string) => {
    setPeriod(0);
    setCustomStart(date);
    setCustomEnd(date);
    setShowAllDays(false);
  };
  const navigate = (target: string) => {
    setNav(target);
    document
      .getElementById(target)
      ?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  const csv = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([dailyCsv(report, start, end, selectedRepo)], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `github-${start}-${end}${selectedRepo === "all" ? "" : `-${selectedRepo.split("/")[1]}`}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const delta = (value: number, previous: number | undefined) =>
    previous === undefined
      ? t("無前期資料")
      : previous === 0
        ? value === 0
          ? t("與前期相同")
          : t("前期無活動")
        : t("{value}% 較前期", { value: `${value >= previous ? "+" : "−"}${Math.abs(((value - previous) / previous) * 100).toFixed(1)}` });
  const displayDays = [...(view?.daily ?? [])].reverse();
  const shownDays = showAllDays ? displayDays : displayDays.slice(0, 10);

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <IconChartArcs size={25} stroke={1.7} />
          </span>
          <span>
            GitRecord<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace">
          <IconBrandGithub size={19} />
          <div>
            <strong>{t("個人工作空間")}</strong>
            <span>GitHub Analytics</span>
          </div>
        </div>
        <div className="nav-label">{t("工作空間")}</div>
        <nav aria-label={t("Dashboard 導覽")}>
          {[
            ["overview", t("總覽"), IconLayoutDashboard],
            ["reflection", t("回顧與節奏"), IconNotebook],
            ["activity", t("活動紀錄"), IconActivity],
            ["repositories", "Repositories", IconGitBranch],
            ["daily", t("每日報告"), IconChartLine],
          ].map(([id, label, Glyph]) => {
            const Icon = Glyph as typeof IconActivity;
            return (
              <button
                key={String(id)}
                className={`nav-item ${nav === id ? "active" : ""}`}
                onClick={() => navigate(String(id))}
              >
                <Icon size={19} stroke={1.6} />
                <span>{String(label)}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <IconInfoCircle size={17} />
          </span>
          <strong>{t("資料來自你的 GitHub")}</strong>
          <p>{t("透過 GitHub 授權同步，支援私人 repo。統計資料保留在這台電腦。")}</p>
          <span className="local-badge">
            <span />
            {t("本機資料")}
          </span>
        </div>
        <div className="sidebar-user">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="avatar-placeholder">
              <IconBrandGithub size={22} />
            </span>
          )}
          <div>
            <strong title={user?.login}>{user?.login ?? t(report ? "所有帳號合計" : "GitHub 帳號")}</strong>
            <span>{report ? t("{count} 個帳號的統計", { count: report.accounts.length }) : t("個人帳號")}</span>
          </div>
        </div>
      </aside>
      <main className="main-content" id="overview">
        <header className="topbar no-print">
          <div>
            <span className="mobile-brand">
              <IconChartArcs size={20} />
              GitRecord.
            </span>
            <span className="breadcrumb">
              {t("工作空間")}<span>/</span>
              <strong>{t("總覽")}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <IconCalendar size={14} />
              Asia/Taipei
            </span>
            <button
              type="button"
              className="language-toggle"
              onClick={toggleLanguage}
              aria-label={language === "en" ? "切換為繁體中文" : "Switch to English"}
              title={language === "en" ? "切換為繁體中文" : "Switch to English"}
              lang={language === "en" ? "zh-Hant" : "en"}
            >
              {language === "en" ? "中" : "EN"}
            </button>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
            >
              {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
            </button>
            <a
              className="github-profile-link"
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={profileLabel}
              title={profileLabel}
            >
              <IconBrandGithub size={20} />
            </a>
          </div>
        </header>
        <div className="dashboard">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CODE, OVER TIME</div>
              <h1>
                {t("代碼的每一份進展")}<span className="heading-dot">.</span>
              </h1>
              <p>{t("看見每天的新增、修整，以及持續累積的軌跡。")}</p>
            </div>
            <div className="heading-actions no-print">
              <button
                className="button button-quiet"
                disabled={!report}
                onClick={() => window.print()}
              >
                <IconPrinter size={16} />
                {t("列印")}
              </button>
              <button
                className="button button-primary"
                disabled={!report}
                onClick={csv}
              >
                <IconDownload size={17} />
                {t("匯出 CSV")}
              </button>
            </div>
          </div>
          <div className="print-context">
            {t("帳號：")}{coverage?.accounts.map((entry) => entry.report.user.login).join(" + ") ?? accountLabel} · {t("期間：")}{start} — {end} ·{" "}
            {selectedRepo === "all" ? t("全部 repositories") : selectedRepo} ·
            Asia/Taipei
            <div>{t(coverage?.partial ? "部分資料" : "完整資料")} · {t("各帳號資料時間：")}</div>
            {coverage?.accounts.map((entry) => <div key={entry.report.user.login}>
              {entry.report.user.login} · {syncTime(entry.report.generatedAt)} · {t("涵蓋")} {entry.report.range.start} — {entry.report.range.end}
              {entry.report.partial ? ` · ${t("部分同步")}` : ""}{entry.syncError ? ` · ${t("同步失敗：")}${message(entry.syncError)}` : ""}
            </div>)}
          </div>
          <AccountPanel accounts={store?.accounts ?? []} auth={auth} syncRunning={status.running} />
          {error && (
            <div className="notice notice-error" role="alert">
              <IconAlertTriangle size={18} />
              <div>
                <strong>{t("同步未完成")}</strong>
                <span>
                  {message(error)}
                  {report ? t(" 畫面仍顯示上次保存的資料。") : ""}
                </span>
              </div>
              <button
                className="button button-quiet"
                onClick={() => void sync()}
                disabled={status.running || authBusy || !activeLogin || !connectionReady}
              >
                {t("重試")}
              </button>
            </div>
          )}
          {failedRepos.length > 0 && (
            <div className="notice notice-warning" role="status">
              <IconAlertTriangle size={18} />
              <div>
                <strong>
                  {t("部分資料 · {count} 個 repo 未完成同步", { count: failedRepos.length })}
                </strong>
                <span>
                  {failedRepos
                    .map((repo) => `${repo.fullName}: ${message(repo.error)}`)
                    .join("; ")}
                </span>
              </div>
            </div>
          )}
          {missingCoverage.length > 0 && <CoverageNotice accounts={missingCoverage} auth={auth} syncRunning={status.running} />}
          {status.running && (
            <div className="sync-progress" role="status">
              <IconRefresh size={16} className="spin" />
              <span>
                {t("正在同步")} <strong>{status.account ? `${status.account} / ` : ""}{message(status.current)}</strong>
              </span>
              <span>
                {status.completed} / {status.total || "…"}
              </span>
              <progress value={status.completed} max={status.total || 1} />
            </div>
          )}
          {!report ? (
            <div className="initial-state">
              <span className="initial-icon">
                <IconChartArcs size={42} stroke={1.3} />
              </span>
              <h2>
                {loading
                  ? t("正在載入你的工作空間")
                  : status.running
                    ? t("連接你的代碼軌跡")
                    : t("準備好查看你的 GitHub")}
              </h2>
              <p>
                {status.running
                  ? t("第一次同步會讀取近一年的 commit 統計，完成後就能查看完整報告。")
                  : t("按上方「連接 GitHub 帳號」，完成授權並選擇 repositories 後便會自動同步，支援私人 repos。")}
              </p>
              {!loading && !status.running && (
                <button
                  className="button button-primary"
                  onClick={() => void sync()}
                  disabled={authBusy || !activeLogin || !connectionReady}
                >
                  <IconRefresh size={16} />
                  {t("同步 GitHub 資料")}
                </button>
              )}
            </div>
          ) : (
            view &&
            annual && (
              <>
                <div className="filterbar no-print">
                  <div className="repo-select account-select">
                    <IconBrandGithub size={16} />
                    <label htmlFor="account-filter">{t("統計帳號")}</label>
                    <select id="account-filter" aria-label={t("篩選帳號")} value={selectedAccount} onChange={(e) => {
                      setAccount(e.target.value);
                      setRepository("all");
                      setShowAllDays(false);
                    }}>
                      <option value="all">{t("所有帳號合計")}</option>
                      {store?.accounts.map((entry) => <option value={entry.report.user.login} key={entry.report.user.login}>{entry.report.user.login}</option>)}
                    </select>
                  </div>
                  <div className="period-switch" aria-label={t("統計期間")}>
                    {[7, 30, 90, 365].map((days) => (
                      <button
                        key={days}
                        aria-pressed={period === days}
                        className={period === days ? "selected" : ""}
                        onClick={() => {
                          setPeriod(days);
                          setShowAllDays(false);
                        }}
                      >
                        {days === 365 ? t("一年") : t("{count} 天", { count: days })}
                      </button>
                    ))}
                  </div>
                  <div className="date-fields">
                    <IconCalendar size={15} />
                    <label className="sr-only" htmlFor="start-date">
                      {t("開始日期")}
                    </label>
                    <input
                      id="start-date"
                      type="date"
                      min={report.range.start}
                      max={end}
                      value={start}
                      onChange={(e) => {
                        if (
                          e.target.value &&
                          e.target.value >= report.range.start &&
                          e.target.value <= end
                        ) {
                          setPeriod(0);
                          setCustomStart(e.target.value);
                          setCustomEnd(end);
                        }
                      }}
                    />
                    <span>—</span>
                    <label className="sr-only" htmlFor="end-date">
                      {t("結束日期")}
                    </label>
                    <input
                      id="end-date"
                      type="date"
                      min={start}
                      max={report.range.end}
                      value={end}
                      onChange={(e) => {
                        if (
                          e.target.value &&
                          e.target.value <= report.range.end &&
                          e.target.value >= start
                        ) {
                          setPeriod(0);
                          setCustomStart(start);
                          setCustomEnd(e.target.value);
                        }
                      }}
                    />
                  </div>
                  <div className="repo-select">
                    <IconGitBranch size={16} />
                    <label className="sr-only" htmlFor="repository-filter">
                      {t("篩選 Repository")}
                    </label>
                    <select
                      id="repository-filter"
                      value={selectedRepo}
                      onChange={(e) => setRepository(e.target.value)}
                    >
                      <option value="all">{t("全部 repositories")}</option>
                      {report.repositories.map((repo) => (
                        <option value={repo.fullName} key={repo.fullName}>
                          {report.accounts.length > 1 ? repo.fullName : repo.name}
                          {repo.status === "error" ? t("（同步失敗）") : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="sync-button"
                    onClick={() => void sync()}
                    disabled={status.running || authBusy || !activeLogin || !connectionReady}
                    aria-label={t("同步 GitHub 資料")}
                    title={t("同步目前授權帳號 {login}，保留其他帳號的資料", { login: activeLogin ?? t("（尚未登入）") })}
                  >
                    <IconRefresh
                      size={17}
                      className={status.running ? "spin" : ""}
                    />
                    <span>{t("同步目前帳號")}</span>
                  </button>
                </div>
                <div className="range-caption">
                  <span>
                    {shortDate(start)} — {shortDate(end)}{" "}
                    <span className="caption-separator">/</span>{" "}
                    {t("{count} 天的代碼活動", { count: view.daily.length })}
                  </span>
                  <span className="sync-time">
                    <IconCircleCheck size={13} />
                    {t(coverage?.partial ? "部分資料" : "已同步")} · {t("最近更新")} {syncTime(report.generatedAt, false)}
                  </span>
                </div>
                <section className="stats-grid" aria-label={t("期間統計摘要")}>
                  {[
                    {
                      label: t("新增行數"),
                      value: `+${number(view.totals.additions)}`,
                      color: "positive",
                      Icon: IconArrowUp,
                      small: delta(
                        view.totals.additions,
                        comparison?.additions,
                      ),
                      note: "ADDITIONS",
                    },
                    {
                      label: t("刪除行數"),
                      value: `−${number(view.totals.deletions)}`,
                      color: "negative",
                      Icon: IconArrowDown,
                      small: delta(
                        view.totals.deletions,
                        comparison?.deletions,
                      ),
                      note: "DELETIONS",
                    },
                    {
                      label: t("淨增行數"),
                      value: signed(view.totals.net),
                      color: "",
                      Icon: IconArrowsDiff,
                      small: t("{count} 行總變更", { count: number(view.totals.changed) }),
                      note: "NET CHANGE",
                    },
                    {
                      label: "Commits",
                      value: number(view.totals.commits),
                      color: "",
                      Icon: IconGitCommit,
                      small: t("{active} 個活躍日 / {days} 天", { active: view.totals.activeDays, days: view.daily.length }),
                      note: "COMMITS",
                    },
                  ].map((metric) => (
                    <div className="stat-card" key={metric.note}>
                      <div className="stat-top">
                        <span>{metric.label}</span>
                        <metric.Icon
                          size={18}
                          className={metric.color}
                          stroke={1.6}
                        />
                      </div>
                      <strong
                        className={`stat-value ${metric.color}`}
                        data-testid={metric.note}
                      >
                        {metric.value}
                      </strong>
                      <div className="stat-bottom">
                        <span>{metric.small}</span>
                        <span>{metric.note}</span>
                      </div>
                    </div>
                  ))}
                </section>
                <ReflectionWorkspace report={report} start={start} end={end} repository={selectedRepo} light={theme === "light"} combined={selectedAccount === "all"} onPeriod={(days) => {
                  setPeriod(days);
                  setShowAllDays(false);
                }} />
                <div className="charts-row">
                  <section className="panel trend-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">CODE CHANGES</span>
                        <h2>{t("代碼變更趨勢")}</h2>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-dot green" />
                          {t("新增")}
                        </span>
                        <span>
                          <i className="legend-dot coral" />
                          {t("刪除")}
                        </span>
                      </div>
                    </div>
                    <div className="trend-summary">
                      <strong>
                        {number(view.totals.changed)}
                        <span>{t("行變更")}</span>
                      </strong>
                      <span>
                        {view.totals.commits
                          ? t("最高活動日 {date} · {count} 行", { date: shortDate(view.peak.date), count: number(view.peak.changed) })
                          : t("這段期間沒有 commit 活動")}
                      </span>
                    </div>
                    <Suspense
                      fallback={
                        <div className="trend-chart chart-loading">
                          {t("載入趨勢圖…")}
                        </div>
                      }
                    >
                      <TrendChart days={view.daily} />
                    </Suspense>
                    <div className="panel-footnote">
                      {t("每日統計 · 包含全部文字檔案的新增與刪除")}
                    </div>
                  </section>
                  <RepositoryList
                    repositories={view.repositories}
                    onSelect={setRepository}
                    showOwner={report.accounts.length > 1}
                  />
                </div>
                <Heatmap
                  days={annual.daily}
                  start={start}
                  end={end}
                  onSelect={selectDay}
                />
                <section className="panel daily-panel" id="daily">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">DAILY BREAKDOWN</span>
                      <h2>{t("把每一天攤開來看")}</h2>
                    </div>
                    <span className="quiet-chip">{t("{count} 天", { count: view.daily.length })}</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">
                        {t("每日新增、刪除、淨增、變更及 commit 數量")}
                      </caption>
                      <thead>
                        <tr>
                          <th>{t("日期")}</th>
                          <th>{t("新增行數")}</th>
                          <th>{t("刪除行數")}</th>
                          <th>{t("淨增行數")}</th>
                          <th>Commits</th>
                          <th>{t("變更比例")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayDays.map((day, index) => (
                          <tr
                            key={day.date}
                            className={
                              index >= shownDays.length ? "print-only-row" : ""
                            }
                          >
                            <td>
                              <span className="table-date">{day.date}</span>
                              <span className="day-name">
                                {new Date(
                                  `${day.date}T00:00:00+08:00`,
                                ).toLocaleDateString(locale, {
                                  timeZone: "Asia/Taipei",
                                  weekday: "short",
                                })}
                              </span>
                            </td>
                            <td className="positive">
                              +{number(day.additions)}
                            </td>
                            <td className="negative">
                              −{number(day.deletions)}
                            </td>
                            <td>{signed(day.net)}</td>
                            <td>
                              <span
                                className={`commit-count ${day.commits ? "has-commits" : ""}`}
                              >
                                {day.commits}
                              </span>
                            </td>
                            <td>
                              <div
                                className="daily-ratio"
                                title={t("{count} 行變更", { count: number(day.changed) })}
                              >
                                {day.changed > 0 ? (
                                  <>
                                    <i style={{ flex: day.additions }} />
                                    <i style={{ flex: day.deletions }} />
                                  </>
                                ) : (
                                  <span />
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>{t("期間合計")}</td>
                          <td className="positive">
                            +{number(view.totals.additions)}
                          </td>
                          <td className="negative">
                            −{number(view.totals.deletions)}
                          </td>
                          <td>{signed(view.totals.net)}</td>
                          <td>{number(view.totals.commits)}</td>
                          <td>{t("{count} 行", { count: number(view.totals.changed) })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {displayDays.length > 10 && (
                    <div className="table-footer no-print">
                      <span>
                        {t("顯示 {shown} / {total} 天", { shown: shownDays.length, total: displayDays.length })}
                      </span>
                      <button onClick={() => setShowAllDays(!showAllDays)}>
                        {t(showAllDays ? "收合明細" : "查看全部日期")}
                        <IconChevronDown
                          size={14}
                          className={showAllDays ? "rotated" : ""}
                        />
                      </button>
                    </div>
                  )}
                </section>
                <footer className="report-footer">
                  <div>
                    <IconInfoCircle size={15} />
                    <p>
                      {t("統計你在各 repo")} <strong>{t("預設分支")}</strong>{t("上的提交，排除 merge commits、fork 與其他作者。時間以 Asia/Taipei 計算。")}
                      <br />{t("共 {repos} 個 repo · 排除 {forks} 個 fork · 行數包含所有文字檔案，未合併分支與未關聯帳號的作者不計入。", { repos: report.repositories.length, forks: report.excludedForks })}
                    </p>
                  </div>
                  <span>
                    Made for your momentum<span className="footer-dot">.</span>
                  </span>
                </footer>
              </>
            )
          )}
        </div>
      </main>
    </div>
  );
}
