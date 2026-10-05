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
import { formatHours, formatPercent, labelFormatter } from "@/lib/format";

/**
 * Цвет кодирует категорию потери, а не отдельный тип: руководителю важно видеть,
 * что «Отпуск», «Больничный» и «Вакансия» — это одна природа потерь.
 */
const CATEGORY_COLOR: Record<string, string> = {
  Отсутствие: "var(--chart-1)",
  "Собрания и обучение": "var(--chart-2)",
  Дорога: "var(--chart-3)",
  "Согласовано с BUM": "var(--chart-4)",
  Обеспечение: "var(--chart-5)",
  Инциденты: "var(--muted-foreground)",
};

const FALLBACK_COLOR = "var(--muted-foreground)";

export type TimeLossDatum = {
  name_ru: string;
  category_ru: string;
  hours: number;
};

export function TimeLossChart({
  data,
  capacityHours,
}: {
  data: TimeLossDatum[];
  capacityHours: number;
}) {
  const categories = [...new Set(data.map((d) => d.category_ru))];

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pb-3">
        {categories.map((category) => (
          <span key={category} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 rounded-full"
              style={{
                backgroundColor: CATEGORY_COLOR[category] ?? FALLBACK_COLOR,
              }}
              aria-hidden
            />
            {category}
          </span>
        ))}
      </div>

      <ResponsiveContainer
        width="100%"
        height={Math.max(200, data.length * 30)}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
        >
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
                  <p className="text-muted-foreground">
                    {formatHours(d.hours)}
                  </p>
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
              formatter={labelFormatter((v) => formatHours(v))}
            />
            {data.map((d) => (
              <Cell
                key={d.name_ru}
                fill={CATEGORY_COLOR[d.category_ru] ?? FALLBACK_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
