import { lazy, Suspense, useMemo, useState } from "react";
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
} from "@tabler/icons-react";
import { dailyCsv, shiftDate, viewReport } from "../shared/report";
import { useReport } from "./useReport";
import { Heatmap } from "./components/Heatmap";
import { RepositoryList } from "./components/RepositoryList";

const number = (value: number) => value.toLocaleString("zh-TW");
const signed = (value: number) =>
  `${value < 0 ? "−" : "+"}${number(Math.abs(value))}`;
const shortDate = (date: string) =>
  `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const TrendChart = lazy(() =>
  import("./components/TrendChart").then((module) => ({
    default: module.TrendChart,
  })),
);

export default function App() {
  const { report, loading, status, error, sync } = useReport();
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
      ? "無前期資料"
      : previous === 0
        ? value === 0
          ? "與前期相同"
          : "前期無活動"
        : `${value >= previous ? "+" : "−"}${Math.abs(((value - previous) / previous) * 100).toFixed(1)}% 較前期`;
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
            gitfolio<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace">
          <IconBrandGithub size={19} />
          <div>
            <strong>個人工作空間</strong>
            <span>GitHub Analytics</span>
          </div>
        </div>
        <div className="nav-label">工作空間</div>
        <nav aria-label="Dashboard 導覽">
          {[
            ["overview", "總覽", IconLayoutDashboard],
            ["activity", "活動紀錄", IconActivity],
            ["repositories", "Repositories", IconGitBranch],
            ["daily", "每日報告", IconChartLine],
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
          <strong>資料來自你的 GitHub</strong>
          <p>私人 repo 也能統計。資料保留在這台電腦，透過 CLI 安全同步。</p>
          <span className="local-badge">
            <span />
            本機資料
          </span>
        </div>
        <div className="sidebar-user">
          {report?.user.avatarUrl ? (
            <img
              src={report.user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="avatar-placeholder">
              <IconBrandGithub size={22} />
            </span>
          )}
          <div>
            <strong>{report?.user.login ?? "GitHub 帳號"}</strong>
            <span>個人帳號</span>
          </div>
          <a
            href={report?.user.url ?? "https://github.com"}
            target="_blank"
            rel="noreferrer"
            aria-label="開啟 GitHub 個人頁"
          >
            <IconBrandGithub size={18} />
          </a>
        </div>
      </aside>
      <main className="main-content" id="overview">
        <header className="topbar no-print">
          <div>
            <span className="mobile-brand">
              <IconChartArcs size={20} />
              gitfolio.
            </span>
            <span className="breadcrumb">
              工作空間<span>/</span>
              <strong>總覽</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <IconCalendar size={14} />
              Asia/Taipei
            </span>
            <a
              href={report?.user.url ?? "https://github.com"}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub 個人頁"
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
                代碼的每一份進展<span className="heading-dot">.</span>
              </h1>
              <p>看見每天的新增、修整，以及持續累積的軌跡。</p>
            </div>
            <div className="heading-actions no-print">
              <button
                className="button button-quiet"
                disabled={!report}
                onClick={() => window.print()}
              >
                <IconPrinter size={16} />
                列印
              </button>
              <button
                className="button button-primary"
                disabled={!report}
                onClick={csv}
              >
                <IconDownload size={17} />
                匯出 CSV
              </button>
            </div>
          </div>
          <div className="print-context">
            帳號：{report?.user.login} · 期間：{start} — {end} ·{" "}
            {selectedRepo === "all" ? "全部 repositories" : selectedRepo} ·
            Asia/Taipei
          </div>
          {error && (
            <div className="notice notice-error" role="alert">
              <IconAlertTriangle size={18} />
              <div>
                <strong>同步未完成</strong>
                <span>
                  {error}
                  {report ? " 畫面仍顯示上次保存的資料。" : ""}
                </span>
              </div>
              <button
                className="button button-quiet"
                onClick={() => void sync()}
                disabled={status.running}
              >
                重試
              </button>
            </div>
          )}
          {report?.partial && (
            <div className="notice notice-warning" role="status">
              <IconAlertTriangle size={18} />
              <div>
                <strong>
                  部分資料 · {failedRepos.length} 個 repo 未完成同步
                </strong>
                <span>
                  {failedRepos
                    .map((repo) => `${repo.name}：${repo.error}`)
                    .join("；")}
                </span>
              </div>
            </div>
          )}
          {status.running && (
            <div className="sync-progress" role="status">
              <IconRefresh size={16} className="spin" />
              <span>
                正在同步 <strong>{status.current}</strong>
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
                  ? "正在載入你的工作空間"
                  : status.running
                    ? "連接你的代碼軌跡"
                    : "準備好查看你的 GitHub"}
              </h2>
              <p>
                {status.running
                  ? "第一次同步會讀取近一年的 commit 統計，完成後就能查看完整報告。"
                  : "在本機安裝 GitHub CLI 並登入，便能讀取公開與私人 repo 的統計。"}
              </p>
              {!loading && !status.running && (
                <button
                  className="button button-primary"
                  onClick={() => void sync()}
                >
                  <IconRefresh size={16} />
                  同步 GitHub 資料
                </button>
              )}
            </div>
          ) : (
            view &&
            annual && (
              <>
                <div className="filterbar no-print">
                  <div className="period-switch" aria-label="統計期間">
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
                        {days === 365 ? "一年" : `${days} 天`}
                      </button>
                    ))}
                  </div>
                  <div className="date-fields">
                    <IconCalendar size={15} />
                    <label className="sr-only" htmlFor="start-date">
                      開始日期
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
                      結束日期
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
                      篩選 Repository
                    </label>
                    <select
                      id="repository-filter"
                      value={selectedRepo}
                      onChange={(e) => setRepository(e.target.value)}
                    >
                      <option value="all">全部 repositories</option>
                      {report.repositories.map((repo) => (
                        <option value={repo.fullName} key={repo.fullName}>
                          {repo.name}
                          {repo.status === "error" ? "（同步失敗）" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="sync-button"
                    onClick={() => void sync()}
                    disabled={status.running}
                    aria-label="同步 GitHub 資料"
                  >
                    <IconRefresh
                      size={17}
                      className={status.running ? "spin" : ""}
                    />
                    <span>同步</span>
                  </button>
                </div>
                <div className="range-caption">
                  <span>
                    {shortDate(start)} — {shortDate(end)}{" "}
                    <span className="caption-separator">/</span>{" "}
                    {view.daily.length} 天的代碼活動
                  </span>
                  <span className="sync-time">
                    <IconCircleCheck size={13} />
                    {report.partial ? "部分同步" : "已同步"} ·{" "}
                    {new Date(report.generatedAt).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </div>
                <section className="stats-grid" aria-label="期間統計摘要">
                  {[
                    {
                      label: "新增行數",
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
                      label: "刪除行數",
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
                      label: "淨增行數",
                      value: signed(view.totals.net),
                      color: "",
                      Icon: IconArrowsDiff,
                      small: `${number(view.totals.changed)} 行總變更`,
                      note: "NET CHANGE",
                    },
                    {
                      label: "Commits",
                      value: number(view.totals.commits),
                      color: "",
                      Icon: IconGitCommit,
                      small: `${view.totals.activeDays} 個活躍日 / ${view.daily.length} 天`,
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
                <div className="charts-row">
                  <section className="panel trend-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">CODE CHANGES</span>
                        <h2>代碼變更趨勢</h2>
                      </div>
                      <div className="chart-legend">
                        <span>
                          <i className="legend-dot green" />
                          新增
                        </span>
                        <span>
                          <i className="legend-dot coral" />
                          刪除
                        </span>
                      </div>
                    </div>
                    <div className="trend-summary">
                      <strong>
                        {number(view.totals.changed)}
                        <span>行變更</span>
                      </strong>
                      <span>
                        {view.totals.commits
                          ? `最高活動日 ${shortDate(view.peak.date)} · ${number(view.peak.changed)} 行`
                          : "這段期間沒有 commit 活動"}
                      </span>
                    </div>
                    <Suspense
                      fallback={
                        <div className="trend-chart chart-loading">
                          載入趨勢圖…
                        </div>
                      }
                    >
                      <TrendChart days={view.daily} />
                    </Suspense>
                    <div className="panel-footnote">
                      每日統計 · 包含全部文字檔案的新增與刪除
                    </div>
                  </section>
                  <RepositoryList
                    repositories={view.repositories}
                    onSelect={setRepository}
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
                      <h2>把每一天攤開來看</h2>
                    </div>
                    <span className="quiet-chip">{view.daily.length} 天</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">
                        每日新增、刪除、淨增、變更及 commit 數量
                      </caption>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>新增行數</th>
                          <th>刪除行數</th>
                          <th>淨增行數</th>
                          <th>Commits</th>
                          <th>變更比例</th>
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
                                ).toLocaleDateString("zh-TW", {
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
                                title={`${day.changed} 行變更`}
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
                          <td>期間合計</td>
                          <td className="positive">
                            +{number(view.totals.additions)}
                          </td>
                          <td className="negative">
                            −{number(view.totals.deletions)}
                          </td>
                          <td>{signed(view.totals.net)}</td>
                          <td>{number(view.totals.commits)}</td>
                          <td>{number(view.totals.changed)} 行</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {displayDays.length > 10 && (
                    <div className="table-footer no-print">
                      <span>
                        顯示 {shownDays.length} / {displayDays.length} 天
                      </span>
                      <button onClick={() => setShowAllDays(!showAllDays)}>
                        {showAllDays ? "收合明細" : "查看全部日期"}
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
                      統計你在各 repo <strong>預設分支</strong>上的提交，排除
                      merge commits、fork 與其他作者。時間以 Asia/Taipei 計算。
                      <br />共 {report.repositories.length} 個 repo · 排除{" "}
                      {report.excludedForks} 個 fork ·
                      行數包含所有文字檔案，未合併分支與未關聯帳號的作者不計入。
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
