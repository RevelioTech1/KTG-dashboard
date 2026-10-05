-- Хранилище данных: звёздная схема.
-- Пересоздаётся целиком при каждом запуске ETL (`npm run etl`).

DROP TABLE IF EXISTS fact_activity;
DROP TABLE IF EXISTS fact_kpi;
DROP TABLE IF EXISTS fact_rating;
DROP TABLE IF EXISTS dim_activity_type;
DROP TABLE IF EXISTS dim_territory;
DROP TABLE IF EXISTS dim_region;
DROP TABLE IF EXISTS dim_ibm;
DROP TABLE IF EXISTS dim_period;
DROP TABLE IF EXISTS dim_incentive_scale;
DROP TABLE IF EXISTS etl_run;
DROP TABLE IF EXISTS data_quality_issue;

CREATE TABLE dim_period (
  period_id   TEXT PRIMARY KEY,          -- '2026-08'
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  label_ru    TEXT    NOT NULL,          -- 'Август 2026'
  days_total  INTEGER NOT NULL,
  source_file TEXT    NOT NULL
);

CREATE TABLE dim_ibm (
  ibm_id   INTEGER PRIMARY KEY,
  ibm_name TEXT NOT NULL UNIQUE
);

CREATE TABLE dim_region (
  region_id   INTEGER PRIMARY KEY,
  region_name TEXT NOT NULL UNIQUE,      -- нормализованное каноническое имя
  variants    TEXT NOT NULL              -- исходные написания через '|'
);

CREATE TABLE dim_territory (
  territory_code TEXT PRIMARY KEY,       -- '1120102'
  region_id      INTEGER REFERENCES dim_region(region_id),
  position       TEXT NOT NULL,          -- TSM | JTSM | BDM | RKAM | KPP Activator
  is_rollup      INTEGER NOT NULL,       -- 1 = управленческая свёртка команды (код оканчивается на 00)
  bdm_code       TEXT,                   -- код руководителя (NULL для самих руководителей)
  ibm_id         INTEGER REFERENCES dim_ibm(ibm_id)
);

CREATE TABLE dim_activity_type (
  activity_code TEXT PRIMARY KEY,        -- исходное значение из календаря
  name_ru       TEXT NOT NULL,
  category      TEXT NOT NULL,           -- weekend | absence | meeting | travel | support | incident | approved
  category_ru   TEXT NOT NULL,
  is_capacity_loss INTEGER NOT NULL      -- 1 = время потеряно для полевой работы
);

CREATE TABLE fact_kpi (
  territory_code TEXT NOT NULL REFERENCES dim_territory(territory_code),
  period_id      TEXT NOT NULL REFERENCES dim_period(period_id),
  type_kpi       TEXT,
  kpi_group      TEXT,
  -- Итоговые показатели
  summary_score      REAL,   -- доля выполнения, 0..2
  final_kpi_score    REAL,   -- балл 0..200
  incentive_rate     REAL,   -- базовая ставка премии, 0..0.4
  tour_penalty       REAL,   -- штраф по контрольным турам, 0..1
  final_incentive_rate REAL, -- итоговая ставка = incentive_rate * (1 - tour_penalty)
  -- Составляющие оценки.
  -- Проверено на данных: summary_score = (доли TOP-10 и KPP по type_kpi) * mandatory_achieve,
  -- то есть невыполненная обязательная задача пропорционально срезает весь балл.
  top10_achieve      REAL,
  top10_target_100   REAL,  -- порог для 100% выполнения TOP-10
  top10_target_200   REAL,  -- порог для 200% выполнения TOP-10
  kpp_achieve        REAL,
  mandatory_achieve  REAL,
  indv_achieve       REAL,
  -- Call rate
  working_days       REAL,
  completed_visits   REAL,
  visits_plan        REAL,
  visits_fact        REAL,
  call_rate_achieve  REAL,
  -- Покрытие маршрута
  coverage_plan      REAL,
  coverage_fact      REAL,
  coverage_achieve   REAL,
  not_visited        REAL,
  -- POSM
  posm_plan          REAL,
  posm_fact          REAL,
  posm_achieve       REAL,
  equipment_plan     REAL,
  equipment_fact     REAL,
  equipment_achieve  REAL,
  -- SKU
  sku_contract_plan       REAL,
  sku_contract_fact       REAL,
  sku_contract_achieve    REAL,
  sku_noncontract_plan    REAL,
  sku_noncontract_fact    REAL,
  sku_noncontract_achieve REAL,
  sku_total_plan          REAL,
  sku_total_fact          REAL,
  sku_total_achieve       REAL,
  -- Качество.
  -- Фактический уровень ошибок считается как pos_with_mistakes / covered_pos;
  -- mistakes_achieve — зачёт по KPI из источника, его правило в файле неоднозначно.
  distribution_achieve REAL,
  hs_achieve           REAL,
  covered_pos          REAL,
  pos_with_mistakes    REAL,
  mistakes_achieve     REAL,
  PRIMARY KEY (territory_code, period_id)
);

CREATE TABLE fact_rating (
  period_id      TEXT NOT NULL REFERENCES dim_period(period_id),
  scope          TEXT NOT NULL,          -- TSM | BDM | RKAM
  territory_code TEXT NOT NULL,
  summary_score  REAL,
  rank           INTEGER,
  PRIMARY KEY (period_id, scope, territory_code)
);

CREATE TABLE fact_activity (
  territory_code TEXT NOT NULL REFERENCES dim_territory(territory_code),
  period_id      TEXT NOT NULL REFERENCES dim_period(period_id),
  day            INTEGER NOT NULL,
  activity_code  TEXT NOT NULL REFERENCES dim_activity_type(activity_code),
  hours          REAL NOT NULL,
  PRIMARY KEY (territory_code, period_id, day, activity_code)
);

CREATE TABLE dim_incentive_scale (
  min_score      INTEGER PRIMARY KEY,
  label          TEXT NOT NULL,          -- исходный заголовок: '80', '<100', '>=100'
  incentive_rate REAL NOT NULL
);

CREATE TABLE etl_run (
  run_at       TEXT NOT NULL,
  source_file  TEXT NOT NULL,
  rows_loaded  INTEGER NOT NULL
);

CREATE TABLE data_quality_issue (
  severity TEXT NOT NULL,                -- warning | info
  area     TEXT NOT NULL,
  message  TEXT NOT NULL
);

CREATE INDEX idx_kpi_period ON fact_kpi(period_id);
CREATE INDEX idx_activity_period ON fact_activity(period_id);
CREATE INDEX idx_territory_region ON dim_territory(region_id);
