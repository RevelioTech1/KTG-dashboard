import type { CliffCandidate } from "@/lib/queries";
import { formatPercent, formatPoints, formatScore } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CliffTable({ rows }: { rows: CliffCandidate[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        В выборке нет сотрудников в зоне 85–100 баллов.
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
            <TableHead className="text-right">До порога</TableHead>
            <TableHead className="text-right">Ставка сейчас</TableHead>
            <TableHead className="text-right">Прирост ставки</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.territory_code}>
              <TableCell className="font-mono text-xs">{r.territory_code}</TableCell>
              <TableCell className="text-muted-foreground">{r.region_name ?? "—"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatScore(r.final_kpi_score, 1)}
              </TableCell>
              <TableCell className="text-chart-2 text-right font-medium tabular-nums">
                +{formatScore(r.points_to_cliff, 1)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatPercent(r.current_rate)}
              </TableCell>
              <TableCell className="text-chart-5 text-right font-semibold tabular-nums">
                +{formatPoints(r.rate_gain)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
