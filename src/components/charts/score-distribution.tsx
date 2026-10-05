"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoreBand } from "@/lib/queries";
import { formatPercent, labelFormatter, pluralRu } from "@/lib/format";

const ZONE_COLOR: Record<ScoreBand["zone"], string> = {
  no_bonus: "var(--chart-1)",
  reduced: "var(--chart-2)",
  full: "var(--chart-4)",
};

const ZONE_LABEL: Record<ScoreBand["zone"], string> = {
  no_bonus: "Премии нет (< 80)",
  reduced: "Сниженная ставка (80–100)",
  full: "Полная ставка (≥ 100)",
};

export function ScoreDistribution({ data }: { data: ScoreBand[] }) {
  return (
    // Растягивается на доступную высоту карточки, чтобы в строке из блоков
    // разной высоты не оставалось пустого места под графиком.
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap gap-x-5 gap-y-2 pb-3">
        {(Object.keys(ZONE_LABEL) as ScoreBand["zone"][]).map((zone) => (
          <span key={zone} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: ZONE_COLOR[zone] }}
              aria-hidden
            />
            {ZONE_LABEL[zone]}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height="100%" minHeight={260}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="band"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as ScoreBand;
              return (
                <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{d.band} баллов</p>
                  <p className="text-muted-foreground mt-1">
                    {d.people} {pluralRu(d.people, "сотрудник", "сотрудника", "сотрудников")}
                  </p>
                  <p className="text-muted-foreground">
                    Средняя ставка: {formatPercent(d.avg_rate)}
                  </p>
                  <p className="text-muted-foreground">{ZONE_LABEL[d.zone]}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="people" radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList
              dataKey="people"
              position="top"
              className="fill-foreground"
              fontSize={11}
              formatter={labelFormatter((v) => (v > 0 ? String(v) : ""))}
            />
            {data.map((d) => (
              <Cell key={d.band} fill={ZONE_COLOR[d.zone]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
