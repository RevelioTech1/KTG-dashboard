import { query, queryOne } from "./db";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS, incentiveRateForScore } from "./incentive";

/**
 * Все показатели эффективности считаются по исполнителям (is_rollup = 0).
 * Строки BDM и RKAM в источнике — свёртка команды целиком, поэтому включать их
 * в средние нельзя: это двойной счёт тех же визитов и точек.
 */
const FIELD_STAFF = "t.is_rollup = 0";

export const HOURS_PER_DAY = 8;

export type Filters = {
  region?: string;
  position?: string;
  ibm?: string;
};

type SqlFilter = { clause: string; params: Record<string, unknown> };

function buildFilter(filters: Filters): SqlFilter {
  const parts: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.region) {
    parts.push("r.region_name = @region");
    params.region = filters.region;
  }
  if (filters.position) {
    parts.push("t.position = @position");
    params.position = filters.position;
  }
  if (filters.ibm) {
    parts.push("i.ibm_name = @ibm");
    params.ibm = filters.ibm;
  }
  return { clause: parts.length ? `AND ${parts.join(" AND ")}` : "", params };
}

const FROM_KPI = `
  FROM fact_kpi k
  JOIN dim_territory t ON t.territory_code = k.territory_code
  LEFT JOIN dim_region r ON r.region_id = t.region_id
  LEFT JOIN dim_ibm i ON i.ibm_id = t.ibm_id
`;

// ---------------------------------------------------------------------------
// Метаданные
// ---------------------------------------------------------------------------

export type PeriodInfo = {
  period_id: string;
  label_ru: string;
  days_total: number;
  source_file: string;
};

export function getPeriods(): PeriodInfo[] {
  return query<PeriodInfo>(
    `SELECT period_id, label_ru, days_total, source_file FROM dim_period ORDER BY period_id`,
  );
}

export function getFilterOptions() {
  return {
    regions: query<{ value: string }>(
      `SELECT DISTINCT r.region_name AS value
       FROM fact_kpi k
       JOIN dim_territory t ON t.territory_code = k.territory_code
       JOIN dim_region r ON r.region_id = t.region_id
       WHERE ${FIELD_STAFF} ORDER BY r.region_name`,
    ).map((r) => r.value),
    positions: query<{ value: string }>(
      `SELECT DISTINCT t.position AS value
       FROM fact_kpi k JOIN dim_territory t ON t.territory_code = k.territory_code
       WHERE ${FIELD_STAFF} ORDER BY t.position`,
    ).map((r) => r.value),
    ibms: query<{ value: string }>(
      `SELECT DISTINCT i.ibm_name AS value
       FROM fact_kpi k
       JOIN dim_territory t ON t.territory_code = k.territory_code
       JOIN dim_ibm i ON i.ibm_id = t.ibm_id
       WHERE ${FIELD_STAFF} ORDER BY i.ibm_name`,
    ).map((r) => r.value),
  };
}

export function getEtlInfo() {
  return query<{ run_at: string; source_file: string; rows_loaded: number }>(
    `SELECT run_at, source_file, rows_loaded FROM etl_run ORDER BY source_file`,
  );
}

export function getDataQuality() {
  return query<{ severity: string; area: string; message: string }>(
    `SELECT severity, area, message FROM data_quality_issue
     ORDER BY CASE severity WHEN 'warning' THEN 0 ELSE 1 END, area`,
  );
}

// ---------------------------------------------------------------------------
// Ключевые показатели
// ---------------------------------------------------------------------------

export type Headline = {
  people: number;
  scored: number;
  avg_score: number;
  median_score: number;
  at_or_above_cliff: number;
  below_bonus_threshold: number;
  avg_rate: number;
  avg_final_rate: number;
  with_penalty: number;
};

export function getHeadline(filters: Filters): Headline {
  const f = buildFilter(filters);
  const row = queryOne<Headline>(
    `SELECT
       COUNT(*) AS people,
       SUM(k.final_kpi_score IS NOT NULL) AS scored,
       AVG(k.final_kpi_score) AS avg_score,
       SUM(k.final_kpi_score >= ${BONUS_CLIFF_SCORE}) AS at_or_above_cliff,
       SUM(k.final_kpi_score < ${MIN_SCORE_FOR_BONUS}) AS below_bonus_threshold,
       AVG(k.incentive_rate) AS avg_rate,
       AVG(k.final_incentive_rate) AS avg_final_rate,
       SUM(COALESCE(k.tour_penalty, 0) > 0) AS with_penalty
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} ${f.clause}`,
    f.params,
  )!;

  const scores = query<{ s: number }>(
    `SELECT k.final_kpi_score AS s ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.final_kpi_score IS NOT NULL ${f.clause}
     ORDER BY k.final_kpi_score`,
    f.params,
  ).map((r) => r.s);

  const median =
    scores.length === 0
      ? 0
      : scores.length % 2
        ? scores[(scores.length - 1) / 2]
        : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;

  return { ...row, median_score: median };
}

// ---------------------------------------------------------------------------
// Распределение по баллам и зонам премирования
// ---------------------------------------------------------------------------

export type ScoreBand = {
  band: string;
  people: number;
  zone: "no_bonus" | "reduced" | "full";
  avg_rate: number;
};

const BANDS: { band: string; from: number; to: number; zone: ScoreBand["zone"] }[] = [
  { band: "0–40", from: 0, to: 40, zone: "no_bonus" },
  { band: "40–80", from: 40, to: 80, zone: "no_bonus" },
  { band: "80–90", from: 80, to: 90, zone: "reduced" },
  { band: "90–100", from: 90, to: 100, zone: "reduced" },
  { band: "100–120", from: 100, to: 120, zone: "full" },
  { band: "120–140", from: 120, to: 140, zone: "full" },
  { band: "140–160", from: 140, to: 160, zone: "full" },
  { band: "160–180", from: 160, to: 180, zone: "full" },
  { band: "180–200", from: 180, to: 201, zone: "full" },
];

export function getScoreBands(filters: Filters): ScoreBand[] {
  const f = buildFilter(filters);
  const rows = query<{ score: number; rate: number | null }>(
    `SELECT k.final_kpi_score AS score, k.incentive_rate AS rate ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.final_kpi_score IS NOT NULL ${f.clause}`,
    f.params,
  );

  return BANDS.map(({ band, from, to, zone }) => {
    const inBand = rows.filter((r) => r.score >= from && r.score < to);
    const rates = inBand.map((r) => r.rate ?? 0);
    return {
      band,
      zone,
      people: inBand.length,
      avg_rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
    };
  });
}

/**
 * Сотрудники чуть ниже 100 баллов. На этом пороге ставка премии скачком
 * удваивается (с ~9.9% до 20%), поэтому доработка именно этой группы даёт
 * наибольший прирост мотивации на единицу усилий.
 */
export type CliffCandidate = {
  territory_code: string;
  region_name: string | null;
  position: string;
  final_kpi_score: number;
  points_to_cliff: number;
  current_rate: number;
  rate_at_cliff: number;
  rate_gain: number;
};

export function getCliffCandidates(filters: Filters, window = 15): CliffCandidate[] {
  const f = buildFilter(filters);
  const rows = query<{
    territory_code: string;
    region_name: string | null;
    position: string;
    final_kpi_score: number;
    tour_penalty: number | null;
  }>(
    `SELECT k.territory_code, r.region_name, t.position, k.final_kpi_score, k.tour_penalty
     ${FROM_KPI}
     WHERE ${FIELD_STAFF}
       AND k.final_kpi_score >= @from AND k.final_kpi_score < ${BONUS_CLIFF_SCORE}
       ${f.clause}
     ORDER BY k.final_kpi_score DESC`,
    { ...f.params, from: BONUS_CLIFF_SCORE - window },
  );

  return rows.map((r) => {
    const penalty = r.tour_penalty ?? 0;
    const current = incentiveRateForScore(r.final_kpi_score) * (1 - penalty);
    const atCliff = incentiveRateForScore(BONUS_CLIFF_SCORE) * (1 - penalty);
    return {
      territory_code: r.territory_code,
      region_name: r.region_name,
      position: r.position,
      final_kpi_score: r.final_kpi_score,
      points_to_cliff: BONUS_CLIFF_SCORE - r.final_kpi_score,
      current_rate: current,
      rate_at_cliff: atCliff,
      rate_gain: atCliff - current,
    };
  });
}

// ---------------------------------------------------------------------------
// Регионы
// ---------------------------------------------------------------------------

export type RegionPerformance = {
  region_name: string;
  people: number;
  avg_score: number;
  avg_final_rate: number;
  share_above_cliff: number;
};

export function getRegionPerformance(filters: Filters, minPeople = 2): RegionPerformance[] {
  const f = buildFilter(filters);
  return query<RegionPerformance>(
    `SELECT r.region_name,
            COUNT(*) AS people,
            AVG(k.final_kpi_score) AS avg_score,
            AVG(k.final_incentive_rate) AS avg_final_rate,
            AVG(CASE WHEN k.final_kpi_score >= ${BONUS_CLIFF_SCORE} THEN 1.0 ELSE 0.0 END)
              AS share_above_cliff
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.final_kpi_score IS NOT NULL AND r.region_name IS NOT NULL
       ${f.clause}
     GROUP BY r.region_name
     HAVING COUNT(*) >= @minPeople
     ORDER BY avg_score DESC`,
    { ...f.params, minPeople },
  );
}

// ---------------------------------------------------------------------------
// Выполнение отдельных метрик
// ---------------------------------------------------------------------------

export type MetricAchievement = {
  key: string;
  label: string;
  achieve: number;
  target: number;
  note?: string;
};

export function getMetricAchievement(filters: Filters): MetricAchievement[] {
  const f = buildFilter(filters);
  const row = queryOne<Record<string, number | null>>(
    `SELECT
       AVG(k.call_rate_achieve) AS call_rate,
       AVG(k.coverage_achieve) AS coverage,
       AVG(k.posm_achieve) AS posm_counter,
       AVG(k.equipment_achieve) AS posm_equipment,
       AVG(k.sku_contract_achieve) AS sku_contract,
       AVG(k.sku_noncontract_achieve) AS sku_noncontract,
       AVG(k.sku_total_achieve) AS sku_total,
       AVG(k.distribution_achieve) AS distribution,
       AVG(k.hs_achieve) AS hs
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} ${f.clause}`,
    f.params,
  )!;

  const definitions: { key: string; label: string; target: number; note?: string }[] = [
    { key: "call_rate", label: "Визиты в день (Call rate)", target: 1 },
    { key: "coverage", label: "Покрытие маршрута", target: 1 },
    { key: "posm_counter", label: "POSM на кассе", target: 0.5, note: "Цель — 50% исполнения" },
    { key: "posm_equipment", label: "POSM на оборудовании", target: 1 },
    { key: "sku_contract", label: "Контрактные SKU", target: 1 },
    { key: "sku_noncontract", label: "Неконтрактные SKU", target: 0.7 },
    { key: "sku_total", label: "SKU по цели", target: 1 },
    { key: "distribution", label: "Соответствие дистрибуции", target: 1 },
    { key: "hs", label: "Соответствие H/S", target: 1 },
  ];

  return definitions
    .filter((d) => row[d.key] !== null && row[d.key] !== undefined)
    .map((d) => ({ ...d, achieve: row[d.key] as number }));
}

/** Фактический уровень ошибок в точках: считается из абсолютных значений. */
export function getErrorRate(filters: Filters) {
  const f = buildFilter(filters);
  return queryOne<{
    covered_pos: number;
    mistakes: number;
    error_rate: number;
    above_target: number;
    measured: number;
  }>(
    `SELECT
       SUM(k.covered_pos) AS covered_pos,
       SUM(k.pos_with_mistakes) AS mistakes,
       CASE WHEN SUM(k.covered_pos) > 0
            THEN SUM(k.pos_with_mistakes) * 1.0 / SUM(k.covered_pos) END AS error_rate,
       SUM(CASE WHEN k.pos_with_mistakes * 1.0 / k.covered_pos > 0.05 THEN 1 ELSE 0 END)
         AS above_target,
       COUNT(*) AS measured
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.covered_pos > 0 ${f.clause}`,
    f.params,
  )!;
}

// ---------------------------------------------------------------------------
// Штрафы по контрольным турам
// ---------------------------------------------------------------------------

export type PenaltyBucket = { penalty: number; people: number; rate_lost: number };

export function getPenaltyImpact(filters: Filters) {
  const f = buildFilter(filters);
  const buckets = query<PenaltyBucket>(
    `SELECT ROUND(k.tour_penalty, 2) AS penalty,
            COUNT(*) AS people,
            SUM(k.incentive_rate - k.final_incentive_rate) AS rate_lost
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND COALESCE(k.tour_penalty, 0) > 0 ${f.clause}
     GROUP BY ROUND(k.tour_penalty, 2)
     ORDER BY penalty`,
    f.params,
  );

  const totals = queryOne<{
    rate_before: number;
    rate_after: number;
    people_penalised: number;
    people_total: number;
  }>(
    `SELECT SUM(k.incentive_rate) AS rate_before,
            SUM(k.final_incentive_rate) AS rate_after,
            SUM(COALESCE(k.tour_penalty, 0) > 0) AS people_penalised,
            COUNT(*) AS people_total
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.incentive_rate IS NOT NULL ${f.clause}`,
    f.params,
  )!;

  return { buckets, totals };
}

// ---------------------------------------------------------------------------
// Рейтинг территорий
// ---------------------------------------------------------------------------

export type TerritoryRow = {
  territory_code: string;
  region_name: string | null;
  position: string;
  ibm_name: string | null;
  type_kpi: string | null;
  final_kpi_score: number;
  incentive_rate: number | null;
  tour_penalty: number | null;
  final_incentive_rate: number | null;
  mandatory_achieve: number | null;
};

export function getTerritoryRanking(
  filters: Filters,
  direction: "top" | "bottom",
  limit = 10,
): TerritoryRow[] {
  const f = buildFilter(filters);
  return query<TerritoryRow>(
    `SELECT k.territory_code, r.region_name, t.position, i.ibm_name, k.type_kpi,
            k.final_kpi_score, k.incentive_rate, k.tour_penalty, k.final_incentive_rate,
            k.mandatory_achieve
     ${FROM_KPI}
     WHERE ${FIELD_STAFF} AND k.final_kpi_score IS NOT NULL ${f.clause}
     ORDER BY k.final_kpi_score ${direction === "top" ? "DESC" : "ASC"}, k.territory_code
     LIMIT @limit`,
    { ...f.params, limit },
  );
}

// ---------------------------------------------------------------------------
// Календарь активностей (следующий период)
// ---------------------------------------------------------------------------

export type TimeLossCategory = {
  category: string;
  category_ru: string;
  hours: number;
  entries: number;
};

export function getTimeLoss() {
  const categories = query<TimeLossCategory>(
    `SELECT d.category, d.category_ru, SUM(a.hours) AS hours, COUNT(*) AS entries
     FROM fact_activity a
     JOIN dim_activity_type d ON d.activity_code = a.activity_code
     WHERE d.is_capacity_loss = 1
     GROUP BY d.category, d.category_ru
     ORDER BY hours DESC`,
  );

  const byType = query<{ name_ru: string; category_ru: string; hours: number }>(
    `SELECT d.name_ru, d.category_ru, SUM(a.hours) AS hours
     FROM fact_activity a
     JOIN dim_activity_type d ON d.activity_code = a.activity_code
     WHERE d.is_capacity_loss = 1
     GROUP BY d.name_ru, d.category_ru
     ORDER BY hours DESC`,
  );

  // Рабочих дней в периоде: все дни минус те, что отмечены как выходные.
  const capacity = queryOne<{
    period_label: string;
    days_total: number;
    weekend_days: number;
    roster: number;
  }>(
    `SELECT p.label_ru AS period_label,
            p.days_total,
            (SELECT COUNT(DISTINCT a.day) FROM fact_activity a
             JOIN dim_activity_type d ON d.activity_code = a.activity_code
             WHERE d.category = 'weekend') AS weekend_days,
            (SELECT COUNT(DISTINCT a.territory_code) FROM fact_activity a) AS roster
     FROM dim_period p
     WHERE p.period_id = (SELECT MAX(period_id) FROM dim_period)`,
  )!;

  const workingDays = capacity.days_total - capacity.weekend_days;
  const capacityHours = workingDays * HOURS_PER_DAY * capacity.roster;
  const lostHours = categories.reduce((sum, c) => sum + c.hours, 0);

  return {
    categories,
    byType,
    periodLabel: capacity.period_label,
    workingDays,
    roster: capacity.roster,
    capacityHours,
    lostHours,
    lostShare: capacityHours > 0 ? lostHours / capacityHours : 0,
  };
}

/** Территории с наибольшей потерей полевого времени в следующем периоде. */
export function getTimeLossByTerritory(limit = 10) {
  return query<{
    territory_code: string;
    region_name: string | null;
    position: string;
    lost_hours: number;
    final_kpi_score: number | null;
  }>(
    `SELECT a.territory_code, r.region_name, t.position,
            SUM(a.hours) AS lost_hours,
            k.final_kpi_score
     FROM fact_activity a
     JOIN dim_activity_type d ON d.activity_code = a.activity_code
     JOIN dim_territory t ON t.territory_code = a.territory_code
     LEFT JOIN dim_region r ON r.region_id = t.region_id
     LEFT JOIN fact_kpi k ON k.territory_code = a.territory_code
     WHERE d.is_capacity_loss = 1
     GROUP BY a.territory_code
     ORDER BY lost_hours DESC
     LIMIT @limit`,
    { limit },
  );
}
