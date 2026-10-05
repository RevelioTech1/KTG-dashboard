/** Сверка загруженных данных с источником и расчёт реальных агрегатов. */
import Database from "better-sqlite3";

const db = new Database("data/warehouse.db", { readonly: true });
const q = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];
const show = (title: string, rows: Record<string, unknown>[]) => {
  console.log(`\n--- ${title} ---`);
  console.table(rows);
};

show(
  "Контроль: премия = ставка * (1 - штраф)",
  q(`SELECT COUNT(*) AS rows_with_rate,
            SUM(ABS(final_incentive_rate - incentive_rate * (1 - COALESCE(tour_penalty,0))) > 0.0001) AS mismatches
     FROM fact_kpi WHERE incentive_rate IS NOT NULL`),
);

show(
  "Контроль: балл KPI = summary_score * 100",
  q(`SELECT COUNT(*) AS n,
            SUM(ABS(final_kpi_score - summary_score*100) > 0.01) AS mismatches
     FROM fact_kpi WHERE final_kpi_score IS NOT NULL AND summary_score IS NOT NULL`),
);

show(
  "Состав по должностям",
  q(`SELECT t.position, t.is_rollup,
            COUNT(*) AS n,
            ROUND(AVG(k.final_kpi_score),1) AS avg_score,
            ROUND(AVG(k.final_incentive_rate)*100,1) AS avg_incentive_pct
     FROM fact_kpi k JOIN dim_territory t USING (territory_code)
     GROUP BY t.position, t.is_rollup ORDER BY n DESC`),
);

show(
  "Итоги по исполнителям (без управленческих свёрток)",
  q(`SELECT COUNT(*) AS people,
            ROUND(AVG(final_kpi_score),1) AS avg_score,
            ROUND(MIN(final_kpi_score),1) AS min_score,
            ROUND(MAX(final_kpi_score),1) AS max_score,
            SUM(final_kpi_score >= 100) AS at_or_above_100,
            SUM(final_kpi_score = 0) AS zero_score,
            SUM(tour_penalty > 0) AS with_penalty,
            ROUND(AVG(incentive_rate)*100,2) AS avg_rate_pct,
            ROUND(AVG(final_incentive_rate)*100,2) AS avg_final_rate_pct
     FROM fact_kpi k JOIN dim_territory t USING (territory_code)
     WHERE t.is_rollup = 0 AND final_kpi_score IS NOT NULL`),
);

show(
  "Распределение по бэндам балла",
  q(`SELECT CASE
              WHEN final_kpi_score < 80 THEN '0-80'
              WHEN final_kpi_score < 100 THEN '80-100'
              WHEN final_kpi_score < 120 THEN '100-120'
              WHEN final_kpi_score < 140 THEN '120-140'
              WHEN final_kpi_score < 160 THEN '140-160'
              WHEN final_kpi_score < 180 THEN '160-180'
              ELSE '180-200' END AS band,
            COUNT(*) AS n
     FROM fact_kpi k JOIN dim_territory t USING (territory_code)
     WHERE t.is_rollup = 0 AND final_kpi_score IS NOT NULL
     GROUP BY band ORDER BY band`),
);

show(
  "Выполнение по метрикам (исполнители)",
  q(`SELECT ROUND(AVG(call_rate_achieve)*100,1) AS call_rate,
            ROUND(AVG(coverage_achieve)*100,1) AS coverage,
            ROUND(AVG(posm_achieve)*100,1) AS posm_counter,
            ROUND(AVG(equipment_achieve)*100,1) AS posm_equipment,
            ROUND(AVG(sku_contract_achieve)*100,1) AS sku_contract,
            ROUND(AVG(sku_noncontract_achieve)*100,1) AS sku_noncontract,
            ROUND(AVG(sku_total_achieve)*100,1) AS sku_total,
            ROUND(AVG(distribution_achieve)*100,1) AS distribution,
            ROUND(AVG(hs_achieve)*100,1) AS hs
     FROM fact_kpi k JOIN dim_territory t USING (territory_code) WHERE t.is_rollup = 0`),
);

show(
  "Фактический уровень ошибок в точках",
  q(`SELECT ROUND(SUM(pos_with_mistakes)*100.0/SUM(covered_pos),2) AS error_rate_pct,
            SUM(covered_pos) AS covered_pos, SUM(pos_with_mistakes) AS mistakes,
            SUM(CASE WHEN pos_with_mistakes*1.0/covered_pos > 0.05 THEN 1 ELSE 0 END) AS above_target
     FROM fact_kpi k JOIN dim_territory t USING (territory_code)
     WHERE t.is_rollup = 0 AND covered_pos > 0`),
);

show(
  "Топ-5 регионов",
  q(`SELECT r.region_name, COUNT(*) AS n, ROUND(AVG(k.final_kpi_score),1) AS avg_score
     FROM fact_kpi k JOIN dim_territory t USING (territory_code)
     JOIN dim_region r USING (region_id)
     WHERE t.is_rollup = 0 AND k.final_kpi_score IS NOT NULL
     GROUP BY r.region_name HAVING COUNT(*) >= 3 ORDER BY avg_score DESC LIMIT 5`),
);

show(
  "Календарь: потери времени по категориям",
  q(`SELECT d.category_ru, SUM(a.hours) AS hours, COUNT(*) AS entries
     FROM fact_activity a JOIN dim_activity_type d USING (activity_code)
     GROUP BY d.category_ru ORDER BY hours DESC`),
);

show(
  "Календарь: ёмкость сентября",
  q(`SELECT
       (SELECT COUNT(DISTINCT territory_code) FROM fact_activity) AS people,
       (SELECT SUM(hours) FROM fact_activity a JOIN dim_activity_type d USING (activity_code)
         WHERE d.is_capacity_loss = 1) AS lost_hours,
       (SELECT COUNT(DISTINCT day) FROM fact_activity a JOIN dim_activity_type d USING (activity_code)
         WHERE d.category = 'weekend') AS weekend_days`),
);

show("Шкала премирования", q(`SELECT * FROM dim_incentive_scale ORDER BY min_score`));
show("Замечания к данным", q(`SELECT severity, area FROM data_quality_issue`));

db.close();
