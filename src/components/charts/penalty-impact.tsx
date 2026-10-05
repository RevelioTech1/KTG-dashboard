"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PenaltyBucket } from "@/lib/queries";
import { formatPercent, formatPoints, pluralRu } from "@/lib/format";

export function PenaltyImpactChart({ data }: { data: PenaltyBucket[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Штрафов по контрольным турам в выборке нет.
      </p>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: formatPercent(d.penalty, 0) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 16, right: 8, left: -24, bottom: 4 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
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
            const d = payload[0].payload as PenaltyBucket & { label: string };
            return (
              <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                <p className="font-medium">Штраф {d.label}</p>
                <p className="text-muted-foreground mt-1">
                  {d.people} {pluralRu(d.people, "сотрудник", "сотрудника", "сотрудников")}
                </p>
                <p className="text-muted-foreground">
                  Удержано суммарно: {formatPoints(d.rate_lost)} ставки
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="people" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList
            dataKey="people"
            position="top"
            className="fill-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
