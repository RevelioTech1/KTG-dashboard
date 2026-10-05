"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RegionPerformance } from "@/lib/queries";
import { formatPercent, formatScore, pluralRu } from "@/lib/format";
import { BONUS_CLIFF_SCORE } from "@/lib/incentive";
import { Button } from "@/components/ui/button";

type View = "top" | "bottom";

export function RegionPerformanceChart({ data }: { data: RegionPerformance[] }) {
  const [view, setView] = useState<View>("bottom");

  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.avg_score - b.avg_score);
    return view === "bottom" ? sorted.slice(0, 12) : sorted.slice(-12);
  }, [data, view]);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Нет регионов, подходящих под выбранные фильтры.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button
          size="sm"
          variant={view === "bottom" ? "default" : "outline"}
          onClick={() => setView("bottom")}
        >
          Требуют внимания
        </Button>
        <Button
          size="sm"
          variant={view === "top" ? "default" : "outline"}
          onClick={() => setView("top")}
        >
          Лидеры
        </Button>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 28)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
          <XAxis type="number" domain={[0, 200]} hide />
          <YAxis
            type="category"
            dataKey="region_name"
            width={128}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <ReferenceLine
            x={BONUS_CLIFF_SCORE}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{
              value: "100",
              position: "top",
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as RegionPerformance;
              return (
                <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{d.region_name}</p>
                  <p className="text-muted-foreground mt-1">
                    Средний балл: {formatScore(d.avg_score, 1)}
                  </p>
                  <p className="text-muted-foreground">
                    Доля ≥ 100 баллов: {formatPercent(d.share_above_cliff, 0)}
                  </p>
                  <p className="text-muted-foreground">
                    Ставка премии: {formatPercent(d.avg_final_rate)}
                  </p>
                  <p className="text-muted-foreground">
                    {d.people} {pluralRu(d.people, "сотрудник", "сотрудника", "сотрудников")}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="avg_score" radius={[0, 4, 4, 0]} maxBarSize={20}>
            <LabelList
              dataKey="avg_score"
              position="right"
              className="fill-foreground"
              fontSize={11}
              formatter={(v: number) => formatScore(v, 0)}
            />
            {rows.map((d) => (
              <Cell
                key={d.region_name}
                fill={d.avg_score >= BONUS_CLIFF_SCORE ? "var(--chart-4)" : "var(--chart-1)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
