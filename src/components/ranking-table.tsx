import type { TerritoryRow } from "@/lib/queries";
import { formatPercent, formatScore } from "@/lib/format";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS } from "@/lib/incentive";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function scoreTone(score: number) {
  if (score >= BONUS_CLIFF_SCORE) return "text-chart-5";
  if (score >= MIN_SCORE_FOR_BONUS) return "text-chart-2";
  return "text-destructive";
}

export function RankingTable({ rows }: { rows: TerritoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Нет данных под выбранные фильтры.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Территория</TableHead>
            <TableHead>Регион</TableHead>
            <TableHead className="text-right">Балл</TableHead>
            <TableHead className="text-right">Ставка</TableHead>
            <TableHead className="text-right">Штраф</TableHead>
            <TableHead className="text-right">Итого</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.territory_code}>
              <TableCell className="font-mono text-xs">
                <span className="flex items-center gap-2">
                  {r.territory_code}
                  <Badge variant="secondary" className="font-sans">
                    {r.position}
                  </Badge>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.region_name ?? "—"}</TableCell>
              <TableCell
                className={`text-right font-semibold tabular-nums ${scoreTone(r.final_kpi_score)}`}
              >
                {formatScore(r.final_kpi_score)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatPercent(r.incentive_rate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.tour_penalty ? (
                  <span className="text-destructive">−{formatPercent(r.tour_penalty, 0)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPercent(r.final_incentive_rate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
