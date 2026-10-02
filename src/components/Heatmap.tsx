import { useEffect, useMemo, useRef, useState } from "react";
import { shiftDate, type DailyStat } from "../../shared/report";

export function Heatmap({
  days,
  start,
  end,
  onSelect,
}: {
  days: DailyStat[];
  start: string;
  end: string;
  onSelect: (date: string) => void;
}) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const hovered = days.find((day) => day.date === hoveredDate) ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current)
      scroller.current.scrollLeft =
        scroller.current.scrollWidth - scroller.current.clientWidth;
  }, []);
  const { weeks, max } = useMemo(() => {
    const firstDay = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    const padding = (firstDay + 6) % 7;
    const cells: (DailyStat | null)[] = [...Array(padding).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    return {
      weeks: Array.from({ length: cells.length / 7 }, (_, i) =>
        cells.slice(i * 7, i * 7 + 7),
      ),
      max: Math.max(1, ...days.map((day) => day.changed)),
    };
  }, [days]);
  const level = (day: DailyStat) =>
    day.commits === 0
      ? 0
      : day.changed === 0
        ? 1
        : Math.min(
            4,
            Math.max(
              1,
              Math.ceil((Math.log1p(day.changed) / Math.log1p(max)) * 4),
            ),
          );
  const active = days.filter((day) => day.commits > 0).length;
  return (
    <section className="panel heatmap-panel" id="activity">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ACTIVITY</span>
          <h2>每一日的積累</h2>
        </div>
        <span className="quiet-chip">
          {active} 個活躍日 <span>/ 365</span>
        </span>
      </div>
      <div className="heatmap-scroll" ref={scroller}>
        <div className="heatmap-body">
          <div className="heatmap-months">
            {weeks.map((week, i) => {
              const first = week.find(Boolean);
              const previous = weeks[i - 1]?.find(Boolean);
              return (
                <span key={i}>
                  {first &&
                  (!previous ||
                    first.date.slice(0, 7) !== previous.date.slice(0, 7))
                    ? `${Number(first.date.slice(5, 7))}月`
                    : ""}
                </span>
              );
            })}
          </div>
          <div className="heatmap-with-labels">
            <div className="week-labels">
              <span>一</span>
              <span>三</span>
              <span>五</span>
              <span>日</span>
            </div>
            <div
              className="heatmap-grid"
              role="group"
              aria-label="全年代碼活動熱圖，點選日期查看當日資料"
            >
              {weeks.map((week, i) => (
                <div className="heatmap-week" key={i}>
                  {week.map((day, j) =>
                    day ? (
                      <button
                        key={day.date}
                        className={`heat-cell level-${level(day)} ${day.date >= start && day.date <= end ? "in-range" : ""} ${day.date === start && day.date === end ? "selected-cell" : ""}`}
                        aria-label={`${day.date}：新增 ${day.additions} 行、刪除 ${day.deletions} 行、${day.commits} commits，查看當日`}
                        title={`${day.date} · +${day.additions.toLocaleString()} / −${day.deletions.toLocaleString()} · ${day.commits} commits`}
                        onMouseEnter={() => setHoveredDate(day.date)}
                        onFocus={() => setHoveredDate(day.date)}
                        onClick={() => onSelect(day.date)}
                      />
                    ) : (
                      <span
                        key={`empty-${j}`}
                        className="heat-cell padding-cell"
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap-footer">
        <span>
          {hovered
            ? `${hovered.date} · ${hovered.changed.toLocaleString()} 行變更 · ${hovered.commits} commits`
            : `${days[0].date} — ${days.at(-1)?.date} · 點選一天查看明細`}
        </span>
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className={`heat-cell level-${i}`} />
          ))}
          <span>多</span>
        </div>
      </div>
      <span className="sr-only">
        最近涵蓋日期：{shiftDate(days.at(-1)!.date, 0)}。完整統計可匯出 CSV。
      </span>
    </section>
  );
}
