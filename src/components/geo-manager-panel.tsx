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
import type { IbmPerformance, RegionPerformance, TerritoryRow } from "@/lib/queries";
import { formatPercent, formatScore, labelFormatter, pluralRu } from "@/lib/format";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS } from "@/lib/incentive";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Dimension = "regions" | "managers";
type RankView = "top" | "bottom";

/** Общая строка графика — чтобы регионы и менеджеры жили в одном BarChart. */
type ChartRow = {
  key: string;
  label: string;
  avg_score: number;
  avg_final_rate: number;
  share_above_cliff: number;
  people: number;
  kind: Dimension;
};

export function GeoManagerPanel({
  regions,
  managers,
  teams,
}: {
  regions: RegionPerformance[];
  managers: IbmPerformance[];
  teams: TerritoryRow[];
}) {
  const [dimension, setDimension] = useState<Dimension>("managers");
  const [rankView, setRankView] = useState<RankView>("bottom");
  const [selectedIbm, setSelectedIbm] = useState<string | null>(null);

  const chartRows = useMemo((): ChartRow[] => {
    if (dimension === "regions") {
      const mapped = regions.map((r) => ({
        key: r.region_name,
        label: r.region_name,
        avg_score: r.avg_score,
        avg_final_rate: r.avg_final_rate,
        share_above_cliff: r.share_above_cliff,
        people: r.people,
        kind: "regions" as const,
      }));
      const sorted = [...mapped].sort((a, b) => a.avg_score - b.avg_score);
      return rankView === "bottom" ? sorted.slice(0, 12) : sorted.slice(-12);
    }
    const mapped = managers.map((m) => ({
      key: m.ibm_name,
      label: m.ibm_name,
      avg_score: m.avg_score,
      avg_final_rate: m.avg_final_rate,
      share_above_cliff: m.share_above_cliff,
      people: m.people,
      kind: "managers" as const,
    }));
    // Менеджеров всего 8 — показываем всех, но сортируем по выбранному виду.
    return [...mapped].sort((a, b) =>
      rankView === "bottom" ? a.avg_score - b.avg_score : b.avg_score - a.avg_score,
    );
  }, [dimension, regions, managers, rankView]);

  const teamRows = useMemo(() => {
    if (dimension !== "managers" || !selectedIbm) return [];
    return teams
      .filter((t) => t.ibm_name === selectedIbm)
      .sort((a, b) => b.final_kpi_score - a.final_kpi_score);
  }, [dimension, selectedIbm, teams]);

  const emptyMessage =
    dimension === "regions"
      ? "Нет регионов, подходящих под выбранные фильтры."
      : "Нет данных по менеджерам IBM. Фамилии приходят только из файла EVA.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-secondary inline-flex rounded-lg p-0.5">
          <Button
            size="sm"
            variant={dimension === "regions" ? "default" : "ghost"}
            className="h-8"
            onClick={() => {
              setDimension("regions");
              setSelectedIbm(null);
            }}
          >
            Регионы
          </Button>
          <Button
            size="sm"
            variant={dimension === "managers" ? "default" : "ghost"}
            className="h-8"
            onClick={() => setDimension("managers")}
          >
            Менеджеры (IBM)
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={rankView === "bottom" ? "default" : "outline"}
            onClick={() => setRankView("bottom")}
          >
            Требуют внимания
          </Button>
          <Button
            size="sm"
            variant={rankView === "top" ? "default" : "outline"}
            onClick={() => setRankView("top")}
          >
            Лидеры
          </Button>
        </div>
      </div>

      {chartRows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, chartRows.length * 30)}>
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ top: 4, right: 44, left: 8, bottom: 4 }}
          >
            <XAxis type="number" domain={[0, 200]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={dimension === "managers" ? 140 : 128}
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
                const d = payload[0].payload as ChartRow;
                return (
                  <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{d.label}</p>
                    <p className="text-muted-foreground mt-1">
                      Средний балл: {formatScore(d.avg_score, 1)}
                    </p>
                    <p className="text-muted-foreground">
                      Доля ≥ 100: {formatPercent(d.share_above_cliff, 0)}
                    </p>
                    <p className="text-muted-foreground">
                      Ставка: {formatPercent(d.avg_final_rate)}
                    </p>
                    <p className="text-muted-foreground">
                      {d.people}{" "}
                      {pluralRu(d.people, "сотрудник", "сотрудника", "сотрудников")}
                    </p>
                    {d.kind === "managers" ? (
                      <p className="text-muted-foreground mt-1">
                        Нажмите столбец, чтобы открыть точки менеджера
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="avg_score"
              radius={[0, 4, 4, 0]}
              maxBarSize={20}
              cursor={dimension === "managers" ? "pointer" : "default"}
              onClick={(data) => {
                if (dimension !== "managers") return;
                const payload = data as { payload?: ChartRow } | ChartRow;
                const row =
                  payload && typeof payload === "object" && "payload" in payload
                    ? payload.payload
                    : (payload as ChartRow);
                const name = row?.key;
                if (!name) return;
                setSelectedIbm((prev) => (prev === name ? null : name));
              }}
            >
              <LabelList
                dataKey="avg_score"
                position="right"
                className="fill-foreground"
                fontSize={11}
                formatter={labelFormatter((v) => formatScore(v, 0))}
              />
              {chartRows.map((d) => (
                <Cell
                  key={d.key}
                  fill={
                    selectedIbm === d.key
                      ? "var(--chart-3)"
                      : d.avg_score >= BONUS_CLIFF_SCORE
                        ? "var(--chart-4)"
                        : "var(--chart-1)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {dimension === "managers" ? (
        <ManagersTable
          managers={
            rankView === "bottom"
              ? [...managers].sort((a, b) => a.avg_score - b.avg_score)
              : [...managers].sort((a, b) => b.avg_score - a.avg_score)
          }
          selected={selectedIbm}
          onSelect={(name) => setSelectedIbm((prev) => (prev === name ? null : name))}
        />
      ) : null}

      {dimension === "managers" && selectedIbm ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Точки менеджера {selectedIbm}</h3>
            <Badge variant="secondary">
              {teamRows.length}{" "}
              {pluralRu(teamRows.length, "территория", "территории", "территорий")}
            </Badge>
          </div>
          <TeamTable rows={teamRows} />
        </div>
      ) : null}

      {dimension === "managers" && !selectedIbm ? (
        <p className="text-muted-foreground text-xs">
          Выберите менеджера на графике или в таблице — откроется список его точек
          (территорий) с баллами и ставками.
        </p>
      ) : null}
    </div>
  );
}

function ManagersTable({
  managers,
  selected,
  onSelect,
}: {
  managers: IbmPerformance[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (managers.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Менеджер (IBM)</TableHead>
            <TableHead className="text-right">Команда</TableHead>
            <TableHead className="text-right">Ср. балл</TableHead>
            <TableHead className="text-right">≥ 100</TableHead>
            <TableHead className="text-right">Без премии</TableHead>
            <TableHead className="text-right">Со штрафом</TableHead>
            <TableHead className="text-right">Ставка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {managers.map((m) => (
            <TableRow
              key={m.ibm_name}
              className={cn(
                "cursor-pointer",
                selected === m.ibm_name && "bg-accent/50",
              )}
              onClick={() => onSelect(m.ibm_name)}
            >
              <TableCell className="font-medium">{m.ibm_name}</TableCell>
              <TableCell className="text-right tabular-nums">{m.people}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-semibold tabular-nums",
                  m.avg_score >= BONUS_CLIFF_SCORE
                    ? "text-chart-5"
                    : m.avg_score >= MIN_SCORE_FOR_BONUS
                      ? "text-chart-2"
                      : "text-destructive",
                )}
              >
                {formatScore(m.avg_score, 1)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(m.share_above_cliff, 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.below_bonus}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m.with_penalty}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(m.avg_final_rate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamTable({ rows }: { rows: TerritoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        У выбранного менеджера нет точек с рассчитанным KPI в текущих фильтрах.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Территория</TableHead>
            <TableHead>Регион</TableHead>
            <TableHead>Должность</TableHead>
            <TableHead className="text-right">Балл</TableHead>
            <TableHead className="text-right">Штраф</TableHead>
            <TableHead className="text-right">Ставка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.territory_code}>
              <TableCell className="font-mono text-xs">{r.territory_code}</TableCell>
              <TableCell className="text-muted-foreground">{r.region_name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{r.position}</Badge>
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-semibold tabular-nums",
                  r.final_kpi_score >= BONUS_CLIFF_SCORE
                    ? "text-chart-5"
                    : r.final_kpi_score >= MIN_SCORE_FOR_BONUS
                      ? "text-chart-2"
                      : "text-destructive",
                )}
              >
                {formatScore(r.final_kpi_score)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.tour_penalty ? (
                  <span className="text-destructive">−{formatPercent(r.tour_penalty, 0)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(r.final_incentive_rate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
