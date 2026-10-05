"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatHours, formatPercent } from "@/lib/format";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type TimeLossDatum = { name_ru: string; category_ru: string; hours: number };

export function TimeLossChart({
  data,
  capacityHours,
}: {
  data: TimeLossDatum[];
  capacityHours: number;
}) {
  const categories = [...new Set(data.map((d) => d.category_ru))];

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name_ru"
          width={190}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as TimeLossDatum;
            return (
              <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{d.name_ru}</p>
                <p className="text-muted-foreground mt-1">{d.category_ru}</p>
                <p className="text-muted-foreground">{formatHours(d.hours)}</p>
                <p className="text-muted-foreground">
                  {formatPercent(d.hours / capacityHours, 1)} фонда времени
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList
            dataKey="hours"
            position="right"
            className="fill-foreground"
            fontSize={11}
            formatter={(v: number) => formatHours(v)}
          />
          {data.map((d) => (
            <Cell key={d.name_ru} fill={COLORS[categories.indexOf(d.category_ru) % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
