/** Проверка восстановленной модели премирования на всех строках источника. */
import Database from "better-sqlite3";
import { incentiveRateForScore } from "../src/lib/incentive";

const db = new Database("data/warehouse.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT territory_code, final_kpi_score AS score, incentive_rate AS rate
     FROM fact_kpi WHERE final_kpi_score IS NOT NULL AND incentive_rate IS NOT NULL`,
  )
  .all() as { territory_code: string; score: number; rate: number }[];

const bad = rows.filter((r) => Math.abs(incentiveRateForScore(r.score) - r.rate) > 1e-9);
console.log(`проверено строк: ${rows.length}`);
console.log(`расхождений:     ${bad.length}`);
for (const r of bad.slice(0, 10)) {
  console.log(
    `  ${r.territory_code}: балл=${r.score.toFixed(2)} в файле=${r.rate.toFixed(6)} модель=${incentiveRateForScore(r.score).toFixed(6)}`,
  );
}
db.close();
process.exit(bad.length === 0 ? 0 : 1);
