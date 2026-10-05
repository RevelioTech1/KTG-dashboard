"use client";

import type { MetricAchievement } from "@/lib/queries";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Полоса выполнения относительно цели. У метрик разные цели (например, у POSM
 * на кассе цель — 50% исполнения, у неконтрактных SKU — 70%), поэтому сравнение
 * идёт с собственной целью каждой метрики, а не с общими 100%.
 */
export function MetricAchievementBars({ data }: { data: MetricAchievement[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.achieve, d.target)));

  return (
    <ul className="space-y-3.5">
      {data.map((d) => {
        const ratioToTarget = d.target > 0 ? d.achieve / d.target : 0;
        const met = ratioToTarget >= 1;
        const atRisk = !met && ratioToTarget >= 0.9;
        return (
          <li key={d.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{d.label}</span>
              <span
                className={cn(
                  "shrink-0 text-sm font-medium tabular-nums",
                  met ? "text-chart-5" : atRisk ? "text-chart-2" : "text-destructive",
                )}
              >
                {formatPercent(d.achieve, 0)}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / цель {formatPercent(d.target, 0)}
                </span>
              </span>
            </div>
            <div className="bg-secondary relative h-2.5 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full",
                  met ? "bg-chart-5" : atRisk ? "bg-chart-2" : "bg-destructive",
                )}
                style={{ width: `${Math.min(100, (d.achieve / max) * 100)}%` }}
              />
              <span
                className="bg-foreground/70 absolute top-0 h-full w-px"
                style={{ left: `${Math.min(100, (d.target / max) * 100)}%` }}
                aria-hidden
              />
            </div>
            {d.note ? <p className="text-muted-foreground mt-1 text-xs">{d.note}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
