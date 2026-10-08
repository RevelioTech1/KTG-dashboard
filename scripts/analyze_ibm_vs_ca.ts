/**
 * Сравнение: что даёт EVA (IBM + KPI) vs что есть только в CA.
 */
import Database from "better-sqlite3";

const db = new Database("data/warehouse.db", { readonly: true });

console.log("=== IBM блоки из EVA ===");
const ibms = db
  .prepare(
    `SELECT i.ibm_id, i.ibm_name,
            SUM(CASE WHEN t.is_rollup = 0 THEN 1 ELSE 0 END) AS field_staff,
            SUM(CASE WHEN t.is_rollup = 1 THEN 1 ELSE 0 END) AS managers,
            GROUP_CONCAT(DISTINCT t.position) AS positions
     FROM dim_ibm i
     JOIN dim_territory t ON t.ibm_id = i.ibm_id
     GROUP BY i.ibm_id
     ORDER BY i.ibm_id`,
  )
  .all();
console.table(ibms);

console.log("\n=== Пример команды IBM (первые 3 менеджера, полевые) ===");
for (const ibm of ibms.slice(0, 3) as { ibm_name: string }[]) {
  const team = db
    .prepare(
      `SELECT t.territory_code, t.position, t.is_rollup, r.region_name,
              k.final_kpi_score, k.final_incentive_rate
       FROM dim_territory t
       LEFT JOIN dim_region r ON r.region_id = t.region_id
       LEFT JOIN fact_kpi k ON k.territory_code = t.territory_code
       JOIN dim_ibm i ON i.ibm_id = t.ibm_id
       WHERE i.ibm_name = ? AND t.is_rollup = 0
       ORDER BY t.territory_code
       LIMIT 8`,
    )
    .all(ibm.ibm_name);
  console.log("\nIBM:", ibm.ibm_name);
  console.table(team);
}

console.log("\n=== Что есть в CA, чего нет в EVA ===");
const onlyCa = db
  .prepare(
    `SELECT t.territory_code, t.position, r.region_name, t.bdm_code, t.ibm_id
     FROM dim_territory t
     LEFT JOIN dim_region r ON r.region_id = t.region_id
     WHERE t.territory_code IN (
       SELECT DISTINCT territory_code FROM fact_activity
     )
     AND t.territory_code NOT IN (SELECT territory_code FROM fact_kpi)`,
  )
  .all();
console.log("только в CA:", onlyCa.length);
console.table(onlyCa.slice(0, 15));

console.log("\n=== Что есть в EVA, чего нет в CA ===");
const onlyEva = db
  .prepare(
    `SELECT t.territory_code, t.position, r.region_name, i.ibm_name
     FROM dim_territory t
     LEFT JOIN dim_region r ON r.region_id = t.region_id
     LEFT JOIN dim_ibm i ON i.ibm_id = t.ibm_id
     WHERE t.territory_code IN (SELECT territory_code FROM fact_kpi)
     AND t.territory_code NOT IN (SELECT DISTINCT territory_code FROM fact_activity)`,
  )
  .all();
console.log("только в EVA:", onlyEva.length);
console.table(onlyEva.slice(0, 15));

console.log("\n=== Поля fact_kpi: что CA никогда не даст ===");
const kpiCols = db.prepare(`PRAGMA table_info(fact_kpi)`).all() as { name: string }[];
console.log(kpiCols.map((c) => c.name).join(", "));

console.log("\n=== Связь BDM из CA с IBM из EVA ===");
const bdmLink = db
  .prepare(
    `SELECT t.territory_code AS bdm_code, t.position, i.ibm_name,
            (SELECT COUNT(*) FROM dim_territory x WHERE x.bdm_code = t.territory_code AND x.is_rollup = 0) AS team_size,
            (SELECT COUNT(*) FROM fact_activity a WHERE a.territory_code = t.territory_code) AS ca_rows_self,
            EXISTS(SELECT 1 FROM fact_kpi k WHERE k.territory_code = t.territory_code) AS in_eva
     FROM dim_territory t
     LEFT JOIN dim_ibm i ON i.ibm_id = t.ibm_id
     WHERE t.is_rollup = 1
     ORDER BY t.territory_code
     LIMIT 20`,
  )
  .all();
console.table(bdmLink);

console.log("\n=== Активности CA: есть ли KPI-метрики? ===");
const acts = db
  .prepare(
    `SELECT activity_code, name_ru, category_ru, COUNT(*) AS n
     FROM fact_activity a JOIN dim_activity_type d USING(activity_code)
     GROUP BY 1 ORDER BY n DESC`,
  )
  .all();
console.table(acts);

db.close();
