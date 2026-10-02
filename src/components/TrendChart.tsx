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

const number = (value: number) => new Intl.NumberFormat("zh-TW").format(value);
const short = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : String(value);

export function TrendChart({ days }: { days: DailyStat[] }) {
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label="每日新增與刪除行數趨勢，完整數值可於每日明細查看"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={days}
          margin={{ top: 18, right: 6, left: -15, bottom: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="additions-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a9e0b0" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#a9e0b0" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="deletions-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e69c85" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#e69c85" stopOpacity={0} />
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
                  <strong>{label}</strong>
                  <span>
                    <i className="legend-dot green" />
                    新增 <b>+{number(Number(payload[0]?.value ?? 0))}</b>
                  </span>
                  <span>
                    <i className="legend-dot coral" />
                    刪除 <b>−{number(Number(payload[1]?.value ?? 0))}</b>
                  </span>
                </div>
              ) : null
            }
            cursor={{ stroke: "var(--muted)", strokeDasharray: "4 4" }}
          />
          <Area
            type="linear"
            dataKey="additions"
            name="新增行數"
            stroke="#a9e0b0"
            strokeWidth={2}
            fill="url(#additions-fill)"
            activeDot={{ r: 4, strokeWidth: 3, stroke: "#151818" }}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="deletions"
            name="刪除行數"
            stroke="#e69c85"
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
