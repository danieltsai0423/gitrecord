import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyStat } from "../../shared/report";
import { useLanguage } from "../i18n";
const short = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : String(value);

export function TrendChart({ days }: { days: DailyStat[] }) {
  const { t, number, shortDate } = useLanguage();
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={t("每日新增與刪除行數趨勢，完整數值可於每日明細查看")}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={days}
          margin={{ top: 18, right: 6, left: -15, bottom: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="additions-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="deletions-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--coral)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--coral)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(date) =>
              `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`
            }
            stroke="var(--muted)"
            axisLine={false}
            tickLine={false}
            minTickGap={40}
            tick={{ fontSize: 12 }}
            dy={10}
          />
          <YAxis
            tickFormatter={short}
            stroke="var(--muted)"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
            width={62}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  <strong>{shortDate(String(label))}</strong>
                  <span>
                    <i className="legend-dot green" />
                    {t("新增")} <b>+{number(Number(payload[0]?.value ?? 0))}</b>
                  </span>
                  <span>
                    <i className="legend-dot coral" />
                    {t("刪除")} <b>−{number(Number(payload[1]?.value ?? 0))}</b>
                  </span>
                </div>
              ) : null
            }
            cursor={{ stroke: "var(--muted)", strokeDasharray: "4 4" }}
          />
          <Area
            type="linear"
            dataKey="additions"
            name={t("新增行數")}
            stroke="var(--green)"
            strokeWidth={2}
            fill="url(#additions-fill)"
            activeDot={{ r: 4, strokeWidth: 3, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="deletions"
            name={t("刪除行數")}
            stroke="var(--coral)"
            strokeWidth={1.5}
            fill="url(#deletions-fill)"
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
