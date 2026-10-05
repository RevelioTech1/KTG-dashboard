/**
 * ETL: Excel -> SQLite (data/warehouse.db).
 *
 * Источники:
 *   uploads/EVA_Final_08_*.xlsx  — факт KPI и премий, лист "Russia_Bonus KPIs" + "Rating 08"
 *   uploads/CA_Sep_26_*.xlsx     — план-календарь активностей, лист "СА June'26" + справочник "Sheet2"
 *
 * Запуск: npm run etl
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const UPLOADS = path.join(ROOT, "uploads");
const DB_PATH = path.join(ROOT, "data", "warehouse.db");

/**
 * Период каждого файла выведен из его содержимого, а не из названия листа:
 * в CA-файле лист подписан "СА June'26", но выходные приходятся на 5-6, 12-13,
 * 19-20, 26-27 числа — это календарь сентября 2026 (1 сентября 2026 — вторник).
 * Название листа осталось от июньского шаблона.
 */
const EVA_PERIOD = { id: "2026-08", year: 2026, month: 8, label: "Август 2026", days: 31 };
const CA_PERIOD = { id: "2026-09", year: 2026, month: 9, label: "Сентябрь 2026", days: 30 };

const CA_DAYS = 30;
const HOURS_PER_DAY = 8;

type Issue = { severity: "warning" | "info"; area: string; message: string };
const issues: Issue[] = [];

function findFile(prefix: string): string {
  const match = fs.readdirSync(UPLOADS).find((f) => f.startsWith(prefix) && f.endsWith(".xlsx"));
  if (!match) throw new Error(`Не найден исходный файл ${prefix}*.xlsx в ${UPLOADS}`);
  return path.join(UPLOADS, match);
}

/** Значение ячейки по адресу A1. Для формул берётся кэшированный результат. */
function cell(ws: XLSX.WorkSheet, addr: string): string | number | null {
  const c = ws[addr] as XLSX.CellObject | undefined;
  if (!c || c.v === undefined || c.v === null) return null;
  if (typeof c.v === "string") {
    const t = c.v.trim();
    return t === "" || t.startsWith("#REF") ? null : t;
  }
  if (typeof c.v === "number") return Number.isFinite(c.v) ? c.v : null;
  return null;
}

function num(ws: XLSX.WorkSheet, col: string, row: number): number | null {
  const v = cell(ws, `${col}${row}`);
  return typeof v === "number" ? v : null;
}

function str(ws: XLSX.WorkSheet, col: string, row: number): string | null {
  const v = cell(ws, `${col}${row}`);
  if (v === null) return null;
  return typeof v === "string" ? v : String(v);
}

// ---------------------------------------------------------------------------
// Нормализация регионов: в источнике одни и те же города записаны по-разному
// ("Rostov-on-Don" / "Rostov-on-don", "Saint Petersburg" / "Saint-Petersburg").
// ---------------------------------------------------------------------------
function regionKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.]/g, "");
}

function buildRegionDim(rawNames: string[]) {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of rawNames) {
    const key = regionKey(raw);
    if (!groups.has(key)) groups.set(key, new Map());
    const counts = groups.get(key)!;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  const canonical = new Map<string, { name: string; variants: string[] }>();
  for (const [key, counts] of groups) {
    const variants = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    // Предпочитаем написание, которое встречается чаще; при равенстве — с большим
    // числом заглавных букв (например "Rostov-on-Don" вместо "Rostov-on-don").
    const best = variants.reduce((acc, v) => {
      if (v[1] !== acc[1]) return v[1] > acc[1] ? v : acc;
      const caps = (s: string) => (s.match(/[A-ZА-Я]/g) ?? []).length;
      return caps(v[0]) > caps(acc[0]) ? v : acc;
    });
    canonical.set(key, { name: best[0], variants: variants.map((v) => v[0]) });
    if (variants.length > 1) {
      issues.push({
        severity: "warning",
        area: "Справочник регионов",
        message: `Разные написания одного региона объединены в «${best[0]}»: ${variants
          .map((v) => `${v[0]} (${v[1]})`)
          .join(", ")}`,
      });
    }
  }
  flagNearDuplicates([...canonical.values()].map((c) => c.name));
  return canonical;
}

/** Все символы `short` встречаются в `long` в том же порядке. */
function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) {
    if (ch === short[i]) i++;
    if (i === short.length) return true;
  }
  return i === short.length;
}

/**
 * Ищем пары вида "Novorossiysk" / "Novorosysk": одно название получается из
 * другого выпадением 1-2 букв. Такие пары — почти наверняка опечатка.
 * Города с разными буквами (Tomsk / Omsk, Ryazan / Kazan) под правило не попадают,
 * поэтому ложных срабатываний нет. Автоматически не объединяем: решение за
 * владельцем данных, мы только выносим расхождение на проверку.
 */
function flagNearDuplicates(names: string[]) {
  const MIN_LENGTH = 8;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [short, long] = [names[i], names[j]].sort((a, b) => a.length - b.length);
      const dropped = long.length - short.length;
      if (dropped < 1 || dropped > 2 || long.length < MIN_LENGTH) continue;
      if (!isSubsequence(short.toLowerCase(), long.toLowerCase())) continue;
      issues.push({
        severity: "warning",
        area: "Справочник регионов",
        message: `Вероятная опечатка в названии региона, нужно решение владельца данных: «${long}» и «${short}» учитываются отдельно`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Справочник активностей календаря
// ---------------------------------------------------------------------------
const ACTIVITY_META: Record<
  string,
  { name: string; category: string; categoryRu: string; loss: boolean }
> = {
  w: { name: "Выходной", category: "weekend", categoryRu: "Выходные", loss: false },
  Отпуск: { name: "Отпуск", category: "absence", categoryRu: "Отсутствие", loss: true },
  Больничный: { name: "Больничный", category: "absence", categoryRu: "Отсутствие", loss: true },
  Вакант: { name: "Вакансия", category: "absence", categoryRu: "Отсутствие", loss: true },
  ЦИ: { name: "Цикловое собрание", category: "meeting", categoryRu: "Собрания и обучение", loss: true },
  "Sales Day": { name: "Sales Day", category: "meeting", categoryRu: "Собрания и обучение", loss: true },
  "Дорога до 1-ой тт >1,5ч": {
    name: "Дорога до первой точки > 1,5 ч",
    category: "travel",
    categoryRu: "Дорога",
    loss: true,
  },
  "Дорога в/из командировки": {
    name: "Дорога в/из командировки",
    category: "travel",
    categoryRu: "Дорога",
    loss: true,
  },
  "Получение POSM": {
    name: "Получение POSM",
    category: "support",
    categoryRu: "Обеспечение",
    loss: true,
  },
  "Сервис авто": { name: "Сервис авто", category: "support", categoryRu: "Обеспечение", loss: true },
  ДТП: { name: "ДТП", category: "incident", categoryRu: "Инциденты", loss: true },
  "Согласовано с BUM": {
    name: "Согласовано с BUM",
    category: "approved",
    categoryRu: "Согласовано с BUM",
    loss: true,
  },
};

function activityMeta(code: string) {
  const meta = ACTIVITY_META[code];
  if (meta) return meta;
  issues.push({
    severity: "warning",
    area: "Календарь активностей",
    message: `Неизвестный тип активности «${code}» — отнесён к категории «Прочее»`,
  });
  return { name: code, category: "other", categoryRu: "Прочее", loss: true };
}

// ---------------------------------------------------------------------------

type KpiRow = {
  territory: string;
  region: string | null;
  position: string;
  ibm: string | null;
  values: Record<string, number | null>;
  typeKpi: string | null;
  kpiGroup: string | null;
};

/** Карта «столбец листа -> поле fact_kpi». Шапка занимает строки 4-6, данные с 7-й. */
const KPI_COLUMNS: Record<string, string> = {
  G: "summary_score",
  K: "indv_achieve",
  L: "top10_target_100",
  M: "top10_target_200",
  N: "top10_achieve",
  O: "kpp_achieve",
  P: "mandatory_achieve",
  Q: "working_days",
  R: "completed_visits",
  S: "visits_plan",
  T: "visits_fact",
  U: "call_rate_achieve",
  V: "coverage_plan",
  W: "coverage_fact",
  X: "coverage_achieve",
  Y: "not_visited",
  Z: "posm_plan",
  AA: "posm_fact",
  AB: "posm_achieve",
  AC: "equipment_plan",
  AD: "equipment_fact",
  AE: "equipment_achieve",
  AF: "sku_contract_plan",
  AG: "sku_contract_fact",
  AH: "sku_contract_achieve",
  AI: "sku_noncontract_plan",
  AJ: "sku_noncontract_fact",
  AK: "sku_noncontract_achieve",
  AL: "sku_total_plan",
  AM: "sku_total_fact",
  AN: "sku_total_achieve",
  AO: "distribution_achieve",
  AP: "hs_achieve",
  AQ: "covered_pos",
  AR: "pos_with_mistakes",
  AS: "mistakes_achieve",
  AT: "final_kpi_score",
  AU: "incentive_rate",
  AV: "tour_penalty",
  AW: "final_incentive_rate",
};

function readEva(file: string) {
  const wb = XLSX.readFile(file, { cellFormula: false });
  const ws = wb.Sheets["Russia_Bonus KPIs"];
  if (!ws) throw new Error("Лист 'Russia_Bonus KPIs' не найден");

  const FIRST_ROW = 7;
  const rows: KpiRow[] = [];

  // Имя IBM указано только в первой строке своего блока (объединённая ячейка A),
  // поэтому протягиваем последнее непустое значение вниз.
  let currentIbm: string | null = null;

  for (let r = FIRST_ROW; r <= 400; r++) {
    const ibmCell = str(ws, "A", r);
    if (ibmCell) currentIbm = ibmCell;

    const territory = str(ws, "C", r);
    const position = str(ws, "D", r);
    if (!territory || !position) {
      // Данные идут непрерывным блоком; первая строка без территории — конец таблицы.
      if (rows.length > 0 && !str(ws, "B", r)) break;
      continue;
    }

    const values: Record<string, number | null> = {};
    for (const [col, field] of Object.entries(KPI_COLUMNS)) {
      values[field] = num(ws, col, r);
    }

    rows.push({
      territory: String(territory),
      region: str(ws, "B", r),
      position,
      ibm: currentIbm,
      typeKpi: str(ws, "E", r),
      kpiGroup: str(ws, "F", r),
      values,
    });
  }

  // Рейтинги: три независимых блока на листе "Rating 08".
  const rws = wb.Sheets["Rating 08"];
  const ratings: { scope: string; territory: string; score: number | null; rank: number | null }[] = [];
  const blocks: { scope: string; territoryCol: string; scoreCol: string; rankCol: string }[] = [
    { scope: "TSM", territoryCol: "C", scoreCol: "E", rankCol: "F" },
    { scope: "BDM", territoryCol: "I", scoreCol: "K", rankCol: "L" },
    { scope: "RKAM", territoryCol: "O", scoreCol: "Q", rankCol: "R" },
  ];
  if (rws) {
    for (const b of blocks) {
      for (let r = 4; r <= 200; r++) {
        const territory = str(rws, b.territoryCol, r);
        if (!territory) continue;
        ratings.push({
          scope: b.scope,
          territory: String(territory),
          score: num(rws, b.scoreCol, r),
          rank: num(rws, b.rankCol, r),
        });
      }
    }
    issues.push({
      severity: "info",
      area: "Рейтинги",
      message:
        "В листе «Rating 08» столбцы с ФИО содержат ошибку #REF! — сотрудники идентифицируются по коду территории",
    });
  }

  // Шкала премирования из той же вкладки (строки 3-4, столбцы V..AJ).
  // Заголовки неоднородны: часть — числа, часть — текст «<100» / «>=100».
  // Для «<100» нижняя граница равна 99, иначе ключ совпал бы с «>=100».
  const scale: { minScore: number; label: string; rate: number }[] = [];
  if (rws) {
    const cols = ["V", "W", "X", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ"];
    for (const c of cols) {
      const header = cell(rws, `${c}3`);
      const rate = num(rws, c, 4);
      if (rate === null || header === null) continue;
      const label = String(header);
      const digits = Number(label.replace(/[^\d]/g, ""));
      if (!Number.isFinite(digits)) continue;
      const minScore = label.startsWith("<") ? digits - 1 : digits;
      scale.push({ minScore, label, rate });
    }
  }

  return { rows, ratings, scale };
}

function readCa(file: string) {
  const wb = XLSX.readFile(file, { cellFormula: false });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().startsWith("са")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const entries: { territory: string; day: number; code: string; hours: number }[] = [];
  const meta = new Map<string, { region: string | null; position: string; bdm: string | null }>();

  for (let r = 4; r <= 400; r++) {
    const territory = str(ws, "B", r);
    const position = str(ws, "D", r);
    if (!territory || !position) continue;

    meta.set(String(territory), {
      region: str(ws, "C", r),
      position,
      bdm: str(ws, "A", r),
    });

    // День N занимает пару столбцов: активность и часы. День 1 начинается со столбца E (5).
    for (let day = 1; day <= CA_DAYS; day++) {
      const colIdx = 5 + 2 * (day - 1);
      const actCol = XLSX.utils.encode_col(colIdx - 1);
      const hoursCol = XLSX.utils.encode_col(colIdx);
      const code = str(ws, actCol, r);
      if (!code) continue;
      const hours = num(ws, hoursCol, r) ?? HOURS_PER_DAY;
      entries.push({ territory: String(territory), day, code, hours });
    }
  }

  return { entries, meta, sheetName };
}

// ---------------------------------------------------------------------------

function main() {
  const evaFile = findFile("EVA_Final_08");
  const caFile = findFile("CA_Sep_26");

  const eva = readEva(evaFile);
  const ca = readCa(caFile);

  if (ca.sheetName.toLowerCase().includes("june")) {
    issues.push({
      severity: "warning",
      area: "Календарь активностей",
      message: `Лист подписан «${ca.sheetName}», но распределение выходных соответствует сентябрю 2026 — период определён по данным, а не по названию листа`,
    });
  }

  // --- Справочник регионов
  const rawRegions = [
    ...eva.rows.map((r) => r.region),
    ...[...ca.meta.values()].map((m) => m.region),
  ].filter((v): v is string => !!v && v.trim() !== "");
  const regionCanonical = buildRegionDim(rawRegions);

  const regionIds = new Map<string, number>();
  const regionRows: { id: number; name: string; variants: string }[] = [];
  let regionSeq = 1;
  for (const [key, { name, variants }] of regionCanonical) {
    regionIds.set(key, regionSeq);
    regionRows.push({ id: regionSeq, name, variants: variants.join("|") });
    regionSeq++;
  }

  // --- Справочник IBM
  const ibmIds = new Map<string, number>();
  let ibmSeq = 1;
  for (const row of eva.rows) {
    if (row.ibm && !ibmIds.has(row.ibm)) ibmIds.set(row.ibm, ibmSeq++);
  }

  // --- Территории: объединяем состав из обоих файлов
  type TerritoryRow = {
    code: string;
    regionId: number | null;
    position: string;
    isRollup: number;
    bdmCode: string | null;
    ibmId: number | null;
  };
  const territories = new Map<string, TerritoryRow>();

  const isRollupCode = (code: string) => (Number(code) % 100 === 0 ? 1 : 0);
  const bdmOf = (code: string) => {
    const n = Number(code);
    if (!Number.isFinite(n) || n % 100 === 0) return null;
    return String(Math.floor(n / 100) * 100);
  };

  for (const row of eva.rows) {
    territories.set(row.territory, {
      code: row.territory,
      regionId: row.region ? (regionIds.get(regionKey(row.region)) ?? null) : null,
      position: row.position,
      isRollup: isRollupCode(row.territory),
      bdmCode: bdmOf(row.territory),
      ibmId: row.ibm ? (ibmIds.get(row.ibm) ?? null) : null,
    });
  }
  for (const [code, m] of ca.meta) {
    const existing = territories.get(code);
    if (existing) {
      if (existing.regionId === null && m.region) {
        existing.regionId = regionIds.get(regionKey(m.region)) ?? null;
      }
      continue;
    }
    territories.set(code, {
      code,
      regionId: m.region ? (regionIds.get(regionKey(m.region)) ?? null) : null,
      position: m.position,
      isRollup: isRollupCode(code),
      bdmCode: m.bdm && m.bdm !== code ? m.bdm : bdmOf(code),
      ibmId: null,
    });
  }

  // IBM известен только из EVA; достраиваем его командам из CA по коду BDM.
  for (const t of territories.values()) {
    if (t.ibmId === null && t.bdmCode) {
      t.ibmId = territories.get(t.bdmCode)?.ibmId ?? null;
    }
  }

  const onlyInEva = eva.rows.filter((r) => !ca.meta.has(r.territory)).length;
  const onlyInCa = [...ca.meta.keys()].filter((c) => !eva.rows.some((r) => r.territory === c)).length;
  if (onlyInEva || onlyInCa) {
    issues.push({
      severity: "info",
      area: "Сопоставление файлов",
      message: `Состав территорий различается: ${onlyInEva} только в EVA (август), ${onlyInCa} только в CA (сентябрь) — штат менялся между периодами`,
    });
  }

  const mislabeledRollup = [...territories.values()].filter(
    (t) => t.isRollup === 1 && !["BDM", "RKAM"].includes(t.position),
  );
  if (mislabeledRollup.length) {
    issues.push({
      severity: "warning",
      area: "Иерархия",
      message: `Код уровня руководителя при должности исполнителя: ${mislabeledRollup
        .map((t) => `${t.code} (${t.position})`)
        .join(", ")}`,
    });
  }

  // --- Активности
  const activityTypes = new Map<string, ReturnType<typeof activityMeta>>();
  for (const e of ca.entries) {
    if (!activityTypes.has(e.code)) activityTypes.set(e.code, activityMeta(e.code));
  }

  // --- Запись в БД
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(fs.readFileSync(path.join(ROOT, "src", "lib", "schema.sql"), "utf8"));

  const tx = db.transaction(() => {
    const insPeriod = db.prepare(
      `INSERT INTO dim_period (period_id, year, month, label_ru, days_total, source_file)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insPeriod.run(
      EVA_PERIOD.id,
      EVA_PERIOD.year,
      EVA_PERIOD.month,
      EVA_PERIOD.label,
      EVA_PERIOD.days,
      path.basename(evaFile),
    );
    insPeriod.run(
      CA_PERIOD.id,
      CA_PERIOD.year,
      CA_PERIOD.month,
      CA_PERIOD.label,
      CA_PERIOD.days,
      path.basename(caFile),
    );

    const insRegion = db.prepare(
      `INSERT INTO dim_region (region_id, region_name, variants) VALUES (?, ?, ?)`,
    );
    for (const r of regionRows) insRegion.run(r.id, r.name, r.variants);

    const insIbm = db.prepare(`INSERT INTO dim_ibm (ibm_id, ibm_name) VALUES (?, ?)`);
    for (const [name, id] of ibmIds) insIbm.run(id, name);

    const insTerritory = db.prepare(
      `INSERT INTO dim_territory (territory_code, region_id, position, is_rollup, bdm_code, ibm_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const t of territories.values()) {
      insTerritory.run(t.code, t.regionId, t.position, t.isRollup, t.bdmCode, t.ibmId);
    }

    const insActivityType = db.prepare(
      `INSERT INTO dim_activity_type (activity_code, name_ru, category, category_ru, is_capacity_loss)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const [code, meta] of activityTypes) {
      insActivityType.run(code, meta.name, meta.category, meta.categoryRu, meta.loss ? 1 : 0);
    }

    const kpiFields = [...new Set(Object.values(KPI_COLUMNS))];
    const insKpi = db.prepare(
      `INSERT INTO fact_kpi (territory_code, period_id, type_kpi, kpi_group, ${kpiFields.join(", ")})
       VALUES (@territory_code, @period_id, @type_kpi, @kpi_group, ${kpiFields
         .map((f) => `@${f}`)
         .join(", ")})`,
    );
    for (const row of eva.rows) {
      insKpi.run({
        territory_code: row.territory,
        period_id: EVA_PERIOD.id,
        type_kpi: row.typeKpi,
        kpi_group: row.kpiGroup,
        ...Object.fromEntries(kpiFields.map((f) => [f, row.values[f] ?? null])),
      });
    }

    const insRating = db.prepare(
      `INSERT OR IGNORE INTO fact_rating (period_id, scope, territory_code, summary_score, rank)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const r of eva.ratings) {
      insRating.run(EVA_PERIOD.id, r.scope, r.territory, r.score, r.rank);
    }

    const insScale = db.prepare(
      `INSERT OR REPLACE INTO dim_incentive_scale (min_score, label, incentive_rate)
       VALUES (?, ?, ?)`,
    );
    for (const s of eva.scale) insScale.run(s.minScore, s.label, s.rate);

    const insActivity = db.prepare(
      `INSERT OR REPLACE INTO fact_activity (territory_code, period_id, day, activity_code, hours)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const e of ca.entries) {
      insActivity.run(e.territory, CA_PERIOD.id, e.day, e.code, e.hours);
    }

    const insIssue = db.prepare(
      `INSERT INTO data_quality_issue (severity, area, message) VALUES (?, ?, ?)`,
    );
    for (const i of issues) insIssue.run(i.severity, i.area, i.message);

    const insRun = db.prepare(
      `INSERT INTO etl_run (run_at, source_file, rows_loaded) VALUES (?, ?, ?)`,
    );
    const now = new Date().toISOString();
    insRun.run(now, path.basename(evaFile), eva.rows.length);
    insRun.run(now, path.basename(caFile), ca.entries.length);
  });

  tx();
  db.close();

  console.log("ETL завершён →", path.relative(ROOT, DB_PATH));
  console.log(`  территорий:        ${territories.size}`);
  console.log(`  записей KPI:       ${eva.rows.length} (${EVA_PERIOD.label})`);
  console.log(`  строк рейтинга:    ${eva.ratings.length}`);
  console.log(`  записей календаря: ${ca.entries.length} (${CA_PERIOD.label})`);
  console.log(`  регионов:          ${regionRows.length}`);
  console.log(`  IBM:               ${ibmIds.size}`);
  console.log(`  замечаний к данным: ${issues.length}`);
  for (const i of issues) console.log(`    [${i.severity}] ${i.area}: ${i.message}`);
}

main();
