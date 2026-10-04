import { useMemo, useRef, useState } from "react";
import { IconArrowUpRight, IconCalendar, IconPhoto, IconTarget, IconUsers } from "@tabler/icons-react";
import { buildReflection, goalScope, weeklyRhythm, type ObservedDay, type Reflection } from "../../shared/reflection";
import type { CombinedReport } from "../../shared/report";
import { readGoals, saveGoals } from "../goals";
import { useLanguage } from "../i18n";
import { RecapDialog } from "./RecapDialog";

function Sparkline({ days, metric, max, login, tone }: { days: ObservedDay[]; metric: "commits" | "changed"; max: number; login: string; tone: number }) {
  const { t, number } = useLanguage();
  const x = (index: number) => days.length === 1 ? 80 : 4 + index / (days.length - 1) * 152;
  const y = (value: number) => 35 - value / max * 29;
  let continuous = false;
  const path = days.map((day, i) => {
    if (!day.known) { continuous = false; return ""; }
    const point = `${continuous ? "L" : "M"}${x(i)},${y(day[metric])}`;
    continuous = true;
    return point;
  }).join(" ");
  return <svg viewBox="0 0 160 40" className={`comparison-spark tone-${tone}`} role="img" aria-label={t("{login} 的每日活動趨勢", { login })}>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" />
    {days.map((day, i) => <g key={day.date}>
      {!day.known && <rect x={x(i) - 1} y={4} width={2} height={31} fill="var(--muted)" opacity=".18" />}
      {(day.known || day[metric] > 0) && <circle cx={x(i)} cy={y(day[metric])} r={days.length > 90 ? 1 : 2} fill={day.known ? "currentColor" : "var(--surface)"} stroke="currentColor">
        <title>{t("{date}：{value}，{coverage}", { date: day.date, value: number(day[metric]), coverage: t(day.known ? "完整資料" : "部分資料") })}</title>
      </circle>}
    </g>)}
  </svg>;
}

export function ReflectionWorkspace({ report, start, end, repository, light, combined, onPeriod }: {
  report: CombinedReport; start: string; end: string; repository: string; light: boolean; combined: boolean;
  onPeriod: (days: number) => void;
}) {
  const { t, number, shortDate, syncTime, locale } = useLanguage();
  const [tab, setTab] = useState(0);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [metric, setMetric] = useState<"commits" | "changed">("commits");
  const [goals, setGoals] = useState(readGoals);
  const [goalStored, setGoalStored] = useState(true);
  const [sharing, setSharing] = useState<Reflection | null>(null);
  const review = useMemo(() => buildReflection(report, start, end, repository), [report, start, end, repository]);
  const week = useMemo(() => weeklyRhythm(report, end), [report, end]);
  const scope = combined ? "combined" : goalScope(report);
  const goal = Object.hasOwn(goals, scope) ? goals[scope] : 0;
  const max = Math.max(1, ...review.accounts.flatMap((account) => account.daily.map((day) => day[metric])));
  const top = review.topRepos[0];
  const tabs = [t("期間回顧"), t("帳號對照"), t("節奏與目標")];
  const stateLabel = (state: typeof week.days[number]["state"]) => t(state === "active" ? "已有活動" : state === "quiet" ? "無活動" : state === "unknown" ? "資料不足" : "未納入");
  const goalChange = (value: number) => {
    const next = { ...goals };
    if (value) next[scope] = value;
    else delete next[scope];
    setGoals(next);
    setGoalStored(saveGoals(next));
  };

  return <section className="panel reflection-workspace" id="reflection" aria-label={t("回顧與節奏")}>
    <div className="panel-heading reflection-heading">
      <div><span className="eyebrow">REFLECT, THEN MOVE</span><h2>{t("回顧與節奏")}</h2><p>{t("把活動紀錄，整理成自己的工作脈絡。")}</p></div>
      <div className="reflection-actions no-print">
        <button type="button" className="button button-quiet" onClick={() => setSharing(review)}><IconPhoto size={16} />{t("產生回顧卡")}</button>
      </div>
    </div>
    <div className="reflection-toolbar no-print">
      <div className="reflection-tabs" role="tablist" aria-label={t("回顧工作台分頁")}>
        {tabs.map((name, i) => <button key={i} ref={(element) => { tabButtons.current[i] = element; }} type="button" role="tab" id={`reflection-tab-${i}`} aria-controls={`reflection-pane-${i}`} aria-selected={tab === i} tabIndex={tab === i ? 0 : -1} onClick={() => setTab(i)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); setTab(next); tabButtons.current[next]?.focus(); }
        }}>{name}</button>)}
      </div>
      <div className="reflection-periods"><button type="button" onClick={() => onPeriod(7)}>{t("近 7 日")}</button><button type="button" onClick={() => onPeriod(30)}>{t("近 30 日")}</button></div>
    </div>
    <div className="reflection-body">
      {!review.complete && <p className="reflection-partial" role="status">{t("部分資料：以下是已保存的活動，實際活動可能更多。")}</p>}
      <div role="tabpanel" id="reflection-pane-0" aria-labelledby="reflection-tab-0" hidden={tab !== 0} tabIndex={0}>
        <div className="review-story">
          <div className="review-narrative">
            <p className="review-lead">{review.totals.commits ? t("本期有 {active} 個活躍日，留下 {commits} 個 commits，投入 {repos} 個專案。", { active: number(review.totals.activeDays), commits: number(review.totals.commits), repos: number(review.activeRepositories) }) : t("這段期間沒有已記錄的活動，可以換個日期範圍回顧。")}</p>
            {top && review.totals.changed > 0 && <p>{t("主要投入：{repo}，占已記錄變更的 {percent}%。", { repo: top.fullName, percent: (top.totals.changed / review.totals.changed * 100).toFixed(0) })}</p>}
            <p className="review-comparison">{review.previous ? <><IconArrowUpRight size={15} />{t("較等長前期 {direction}{count} 個 commits。", { direction: review.totals.commits >= review.previous.commits ? "+" : "−", count: number(Math.abs(review.totals.commits - review.previous.commits)) })}</> : t("前期比較需兩期資料皆完整。")}</p>
          </div>
          <dl className="review-facts">
            <div><dt>{t("最長連續活動")}</dt><dd data-testid="review-streak">{review.longestStreak === null ? t("無法確認") : t("{count} 天", { count: review.longestStreak })}</dd></div>
            <div><dt>{t("最活躍日")}</dt><dd>{review.peakDay ? shortDate(review.peakDay.date) : "—"}</dd></div>
            <div><dt>{t("活躍專案")}</dt><dd>{number(review.activeRepositories)}</dd></div>
          </dl>
        </div>
        <div className="review-months-heading"><span>{t("月度軌跡")}</span><span>Commits · {start} — {end}</span></div>
        <div className="review-months" role="img" aria-label={t("月度活動，以 commits 計算")}>
          {review.months.map((month) => <div key={month.month} className={month.complete ? "" : "month-partial"} title={t("{month}：{count} 個 commits，{coverage}", { month: month.month, count: number(month.commits), coverage: t(month.complete ? "完整資料" : "部分資料") })}>
            <strong>{number(month.commits)}</strong><div className="review-month-track"><i style={{ height: `${month.commits / Math.max(1, ...review.months.map((entry) => entry.commits)) * 100}%` }} /></div><span>{month.month.replace("-", "/")}</span>
          </div>)}
        </div>
      </div>
      <div role="tabpanel" id="reflection-pane-1" aria-labelledby="reflection-tab-1" hidden={tab !== 1} tabIndex={0}>
        <div className="comparison-caption"><p>{t("相同日期、相同尺度，看看活動分布在各帳號的情況。")}</p><label className="no-print">{t("對照指標")}<select aria-label={t("對照指標")} value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="commits">Commits</option><option value="changed">{t("變更行數")}</option></select></label></div>
        <div className="comparison-scroll"><table className="comparison-table" role="table"><caption className="sr-only">{t("帳號活動對照")}</caption>
          <thead><tr><th scope="col">{t("GitHub 帳號")}</th><th scope="col">{t("代碼變更趨勢")}</th><th scope="col">Commits</th><th scope="col">{t("變更行數")}</th><th scope="col">{t("活躍日")}</th><th scope="col">{t("涵蓋")}</th></tr></thead>
          <tbody>{review.accounts.map((account, i) => <tr key={account.login}>
            <td><span className={`account-tone tone-${i % 5}`} /><strong>{account.login}</strong><small>{t("最近更新")} {syncTime(account.generatedAt, false)}</small></td>
            <td><Sparkline days={account.daily} metric={metric} max={max} login={account.login} tone={i % 5} /></td>
            <td data-label="Commits">{number(account.totals.commits)}</td><td data-label={t("變更行數")}>{number(account.totals.changed)}</td><td data-label={t("活躍日")}>{number(account.totals.activeDays)}</td><td><span className={account.complete ? "positive" : "reflection-partial"}>{t(account.complete ? "完整資料" : "部分資料")}</span><small>{account.range.start} — {account.range.end}</small></td>
          </tr>)}</tbody>
        </table></div>
        {review.accounts.length > 1 ? <div className="shared-days"><IconUsers size={20} /><div><strong>{t("共同活躍日")} · {review.complete ? t("{count} 天", { count: review.sharedActiveDays }) : t("至少 {count} 天", { count: review.sharedActiveDays })}</strong><p>{t("同一天至少兩個帳號有 commits；合計活躍日仍只算一天。")}</p></div></div> : <p className="reflection-hint">{t("只有一個帳號在目前範圍內；選擇所有帳號合計可查看並排對照。")}</p>}
        {!review.complete && <p className="reflection-hint">{t("空白區段代表未確認的資料，並非零活動。")}</p>}
      </div>
      <div role="tabpanel" id="reflection-pane-2" aria-labelledby="reflection-tab-2" hidden={tab !== 2} tabIndex={0}>
        <div className="rhythm-heading"><div><h3><IconTarget size={19} />{t("每週活躍目標")}</h3><p>{t("選取週：{start} — {end}", { start: week.start, end: week.end })}</p></div><label className="no-print"><span className="sr-only">{t("設定每週活躍天數")}</span><select aria-label={t("設定每週活躍天數")} value={goal} onChange={(e) => goalChange(Number(e.target.value))}><option value="0">{t("尚未設定目標")}</option>{[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{t("每週 {count} 天", { count })}</option>)}</select></label></div>
        <div className="rhythm-grid" role="list" aria-label={t("每週活躍目標")}>
          {week.days.map((day) => <div className={`rhythm-day ${day.state}`} key={day.date} role="listitem" aria-label={t("{date}：{state}", { date: day.date, state: stateLabel(day.state) })}>
            <span>{new Date(`${day.date}T00:00:00+08:00`).toLocaleDateString(locale, { timeZone: "Asia/Taipei", weekday: "short" })}</span>
            <strong>{day.state === "active" ? "✓" : day.state === "quiet" ? "○" : "—"}</strong><small>{day.date.slice(5).replace("-", "/")}</small><small>{stateLabel(day.state)}</small>
          </div>)}
        </div>
        {goal > 0 ? <div className="rhythm-progress"><strong>{t("已記錄 {active} / {goal} 天", { active: week.activeDays, goal })}</strong><progress value={Math.min(week.activeDays, goal)} max={goal} aria-label={t("每週活躍目標")} />{week.activeDays >= goal && <span className="positive">{t("已達成選取週目標")}</span>}</div> : <p className="reflection-hint">{t("先設定適合自己的頻率。休息日不需要補交 commits。")}</p>}
        <p className="reflection-hint"><IconCalendar size={14} />{t("截至 {date}，已記錄 {count} 個活躍日。", { date: end, count: week.activeDays })}</p>
        <p className="reflection-hint">{t("以目前帳號範圍的全部 repos 計算，每日只算一次；不受 repo 篩選影響。")}</p>
        {!week.complete && <p className="reflection-partial">{t("這週尚有未確認的日期，進度只顯示已保存的活動。")}</p>}
        {!goalStored && <p role="status" className="reflection-hint">{t("設定只保留於本次使用，瀏覽器儲存不可用。")}</p>}
      </div>
      <p className="reflection-footnote">{t("連續活動依選取期間的日曆日計算；資料不足時不推算。")}</p>
    </div>
    {sharing && <RecapDialog review={sharing} light={light} close={() => setSharing(null)} />}
  </section>;
}
