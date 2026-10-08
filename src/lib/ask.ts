/**
 * Ответы на вопросы руководителя по данным хранилища.
 *
 * Работает без LLM: вопрос разбирается по ключевым словам и маршрутизируется
 * к проверенным SQL-запросам. ФИО в источнике недоступны (#REF!), поэтому
 * сотрудники идентифицируются по коду территории, региону и должности.
 */
import {
  getCliffCandidates,
  getErrorRate,
  getHeadline,
  getIbmPerformance,
  getIbmTeam,
  getMetricAchievement,
  getPenaltyImpact,
  getRegionPerformance,
  getTerritoryRanking,
  getTimeLoss,
  getTimeLossByTerritory,
  type TerritoryRow,
} from "./queries";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS } from "./incentive";
import {
  formatHours,
  formatPercent,
  formatPoints,
  formatScore,
  pluralRu,
} from "./format";
import { extractTerritoryCodes, type AskHistoryMessage } from "./ask-history";

export type AskRow = {
  cells: string[];
};

export type AskAnswer = {
  /** Короткий заголовок ответа */
  title: string;
  /** Развёрнутый текст */
  text: string;
  /** Таблица, если есть */
  columns?: string[];
  rows?: AskRow[];
  /** Подсказка, если вопрос не распознан */
  suggestions?: string[];
  /** Распознанное намерение — для отладки и тестов */
  intent: string;
  /** Откуда пришёл ответ */
  source?: "rules" | "llm" | "logical";
};

const SUGGESTIONS = [
  "Кого дотянуть до 100 баллов для наибольшего эффекта?",
  "У кого из сотрудников лучший KPI?",
  "Кто в аутсайдерах по KPI?",
  "Выдай топ-5 регионов по среднему баллу",
  "Сравни менеджеров IBM по KPI",
  "Какая команда у Petr Artemev?",
  "Сколько сотрудников без премии?",
  "Как штрафы влияют на премии?",
];

function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Извлекает N из «топ-5», «топ 10», «5 лучших», иначе defaultLimit. */
function extractLimit(q: string, defaultLimit = 5): number {
  const patterns = [
    /топ[-\s]?(\d{1,2})/,
    /(\d{1,2})\s+(лучших|худших|первых|последних|сотрудник|регион)/,
    /(лучших|худших|первых)\s+(\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (!m) continue;
    const n = Number(m[1] ?? m[2]);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
  }
  // «лучший» / «худший» в единственном числе → 1
  if (/\b(лучший|худший|лидер|аутсайдер)\b/.test(q) && !/топ/.test(q)) return 1;
  return defaultLimit;
}

function isBottom(q: string): boolean {
  return /(худш|аутсайд|отста|слаб|плох|требуют внимания|низк|меньше всего|наименьш)/.test(
    q,
  );
}

function aboutRegions(q: string): boolean {
  return /регион/.test(q);
}

function aboutManagers(q: string): boolean {
  return /(менеджер|ibm|команд[аыуе]|руководител)/.test(q);
}

/** Ищет фамилию IBM в вопросе по списку из хранилища. */
function findIbmName(q: string): string | null {
  const managers = getIbmPerformance({});
  for (const m of managers) {
    const full = m.ibm_name.toLowerCase();
    const parts = full.split(/\s+/);
    const last = parts[parts.length - 1];
    const first = parts[0];
    if (q.includes(full) || (last.length >= 4 && q.includes(last))) {
      return m.ibm_name;
    }
    // «Петр Артемьев» vs "Petr Artemev" — латиница в источнике, кириллицу не матчим по фамилии
    if (first.length >= 4 && q.includes(first) && parts.length > 1) {
      return m.ibm_name;
    }
  }
  return null;
}

function aboutEmployees(q: string): boolean {
  return /(сотрудник|территор|tsm|jtsm|исполнител|у кого|кто из)/.test(q);
}

function aboutKpi(q: string): boolean {
  return /(kpi|кпи|балл|рейтинг|эффективн|результат|показател)/.test(q);
}

function aboutBonus(q: string): boolean {
  return /(преми|бонус|ставк|incentive|вознагражд)/.test(q);
}

function aboutPenalty(q: string): boolean {
  return /(штраф|контрол.*тур|удержан)/.test(q);
}

function aboutCliff(q: string): boolean {
  return /(порог|100 балл|быстр.*выигр|недотяг|близк.*к 100|до 100|дотянуть|дотянут|наибольш.*эффект|максимальн.*эффект|зон[аы].*выигр|скачок.*ставк)/.test(
    q,
  );
}

function aboutNoBonus(q: string): boolean {
  return /(без преми|не получ.*преми|ниже 80|не набрал)/.test(q);
}

function aboutTime(q: string): boolean {
  return /(время|календар|отпуск|потер.*поле|загрузк|активност)/.test(q);
}

function aboutMetrics(q: string): boolean {
  return /(метрик|posm|sku|визит|call rate|покрыт|выкладк|ошибк)/.test(q);
}

function aboutAverage(q: string): boolean {
  return /(средн|сколько|какой.*общий|общая картина|сводк|итог)/.test(q);
}

function territoryLabel(r: TerritoryRow): string {
  const region = r.region_name ?? "без региона";
  return `${r.territory_code} · ${r.position} · ${region}`;
}

function answerTopEmployees(limit: number, bottom: boolean): AskAnswer {
  const rows = getTerritoryRanking({}, bottom ? "bottom" : "top", limit);
  if (rows.length === 0) {
    return {
      intent: bottom ? "bottom_employees" : "top_employees",
      title: "Нет данных",
      text: "В хранилище нет сотрудников с рассчитанным баллом KPI.",
    };
  }

  const best = rows[0];
  const title = bottom
    ? limit === 1
      ? "Сотрудник с наименьшим KPI"
      : `Топ-${limit} сотрудников с наименьшим KPI`
    : limit === 1
      ? "Сотрудник с лучшим KPI"
      : `Топ-${limit} сотрудников по KPI`;

  const lead =
    limit === 1
      ? bottom
        ? `Наименьший балл у территории ${territoryLabel(best)}: ${formatScore(best.final_kpi_score)}.`
        : `Лучший балл у территории ${territoryLabel(best)}: ${formatScore(best.final_kpi_score)}.`
      : bottom
        ? `Ниже — ${rows.length} ${pluralRu(rows.length, "территория", "территории", "территорий")} с наименьшим баллом.`
        : `Ниже — ${rows.length} ${pluralRu(rows.length, "территория", "территории", "территорий")} с наибольшим баллом.`;

  return {
    intent: bottom ? "bottom_employees" : "top_employees",
    title,
    text: `${lead} ФИО в источнике недоступны (#REF!), поэтому идентификация идёт по коду территории. IBM указан в таблице.`,
    columns: ["Территория", "Регион", "Должность", "IBM", "Балл", "Ставка"],
    rows: rows.map((r) => ({
      cells: [
        r.territory_code,
        r.region_name ?? "—",
        r.position,
        r.ibm_name ?? "—",
        formatScore(r.final_kpi_score),
        formatPercent(r.final_incentive_rate),
      ],
    })),
    suggestions: bottom
      ? [
          "У какого IBM этот аутсайдер?",
          "Сравни менеджеров IBM по KPI",
          "Кого дотянуть до 100 баллов для наибольшего эффекта?",
        ]
      : [
          "У какого IBM этот лидер?",
          "Кто в аутсайдерах по KPI?",
          "Выдай топ-5 регионов по среднему баллу",
        ],
  };
}

function answerManagers(limit: number, bottom: boolean): AskAnswer {
  const all = getIbmPerformance({});
  const sorted = [...all].sort((a, b) =>
    bottom ? a.avg_score - b.avg_score : b.avg_score - a.avg_score,
  );
  const rows = sorted.slice(0, Math.min(limit, sorted.length));

  if (rows.length === 0) {
    return {
      intent: "managers",
      title: "Нет данных по менеджерам",
      text: "Фамилии IBM есть только в файле EVA. Без него разрез по менеджерам недоступен.",
    };
  }

  const lead = bottom
    ? `Самая слабая команда — ${rows[0].ibm_name} (ср. балл ${formatScore(rows[0].avg_score, 1)}).`
    : `Лучшая команда — ${rows[0].ibm_name} (ср. балл ${formatScore(rows[0].avg_score, 1)}).`;

  return {
    intent: "managers",
    title: bottom ? "Менеджеры IBM: требуют внимания" : "Менеджеры IBM по среднему KPI",
    text: `${lead} Балл считается по исполнителям команды (TSM/JTSM/KPP Activator), без свёрток BDM/RKAM.`,
    columns: ["Менеджер", "Команда", "Ср. балл", "≥ 100", "Без премии", "Со штрафом", "Ставка"],
    rows: rows.map((m) => ({
      cells: [
        m.ibm_name,
        String(m.people),
        formatScore(m.avg_score, 1),
        formatPercent(m.share_above_cliff, 0),
        String(m.below_bonus),
        String(m.with_penalty),
        formatPercent(m.avg_final_rate),
      ],
    })),
  };
}

function answerIbmTeam(ibmName: string): AskAnswer {
  const summary = getIbmPerformance({}).find((m) => m.ibm_name === ibmName);
  const team = getIbmTeam(ibmName);

  if (!summary || team.length === 0) {
    return {
      intent: "ibm_team",
      title: `Команда ${ibmName}`,
      text: "У этого менеджера нет точек с рассчитанным KPI.",
    };
  }

  return {
    intent: "ibm_team",
    title: `Команда ${ibmName}`,
    text:
      `${summary.people} ${pluralRu(summary.people, "исполнитель", "исполнителя", "исполнителей")}, ` +
      `средний балл ${formatScore(summary.avg_score, 1)}, ` +
      `доля ≥ 100 — ${formatPercent(summary.share_above_cliff, 0)}, ` +
      `без премии — ${summary.below_bonus}, со штрафом — ${summary.with_penalty}.`,
    columns: ["Территория", "Регион", "Должность", "Балл", "Ставка"],
    rows: team.map((r) => ({
      cells: [
        r.territory_code,
        r.region_name ?? "—",
        r.position,
        formatScore(r.final_kpi_score),
        formatPercent(r.final_incentive_rate),
      ],
    })),
  };
}

function answerTopRegions(limit: number, bottom: boolean): AskAnswer {
  // Как на дашборде: регионы с одним сотрудником дают неустойчивое среднее.
  const all = getRegionPerformance({}, 2);
  const sorted = [...all].sort((a, b) =>
    bottom ? a.avg_score - b.avg_score : b.avg_score - a.avg_score,
  );
  const rows = sorted.slice(0, limit);

  if (rows.length === 0) {
    return {
      intent: bottom ? "bottom_regions" : "top_regions",
      title: "Нет данных",
      text: "Регионов с рассчитанным KPI не найдено.",
    };
  }

  const title = bottom
    ? limit === 1
      ? "Регион с наименьшим средним баллом"
      : `Топ-${limit} регионов с наименьшим средним баллом`
    : limit === 1
      ? "Регион-лидер по среднему баллу"
      : `Топ-${limit} регионов по среднему баллу`;

  const lead = bottom
    ? `Самый слабый регион — ${rows[0].region_name} (${formatScore(rows[0].avg_score, 1)}).`
    : `Лидер — ${rows[0].region_name} со средним баллом ${formatScore(rows[0].avg_score, 1)}.`;

  return {
    intent: bottom ? "bottom_regions" : "top_regions",
    title,
    text: `${lead} В рейтинг включены регионы, где работает не меньше двух исполнителей.`,
    columns: ["Регион", "Сотрудников", "Средний балл", "Доля ≥ 100", "Ставка"],
    rows: rows.map((r) => ({
      cells: [
        r.region_name,
        String(r.people),
        formatScore(r.avg_score, 1),
        formatPercent(r.share_above_cliff, 0),
        formatPercent(r.avg_final_rate),
      ],
    })),
  };
}

function answerHeadline(): AskAnswer {
  const h = getHeadline({});
  const shareAbove = h.scored > 0 ? h.at_or_above_cliff / h.scored : 0;
  const shareNoBonus = h.scored > 0 ? h.below_bonus_threshold / h.scored : 0;

  return {
    intent: "headline",
    title: "Сводка по команде",
    text:
      `Средний балл KPI — ${formatScore(h.avg_score, 1)} из 200 (медиана ${formatScore(h.median_score, 1)}). ` +
      `Норму (≥ ${BONUS_CLIFF_SCORE}) выполнили ${formatPercent(shareAbove, 0)} — ${h.at_or_above_cliff} из ${h.scored}. ` +
      `Без премии (< ${MIN_SCORE_FOR_BONUS}) остались ${formatPercent(shareNoBonus, 0)} — ${h.below_bonus_threshold} ${pluralRu(h.below_bonus_threshold, "сотрудник", "сотрудника", "сотрудников")}. ` +
      `Итоговая ставка премии — ${formatPercent(h.avg_final_rate)} от оклада ` +
      `(базовая ${formatPercent(h.avg_rate)}, штрафы снизили на ${formatPoints(h.avg_rate - h.avg_final_rate)}).`,
  };
}

function answerNoBonus(): AskAnswer {
  const h = getHeadline({});
  const rows = getTerritoryRanking({}, "bottom", 50).filter(
    (r) => r.final_kpi_score < MIN_SCORE_FOR_BONUS,
  );
  const share = h.scored > 0 ? h.below_bonus_threshold / h.scored : 0;

  return {
    intent: "no_bonus",
    title: "Сотрудники без премии",
    text:
      `${h.below_bonus_threshold} ${pluralRu(h.below_bonus_threshold, "сотрудник", "сотрудника", "сотрудников")} ` +
      `(${formatPercent(share, 0)}) не набрали ${MIN_SCORE_FOR_BONUS} баллов и премии не получат. ` +
      `Ниже — до 15 территорий с наименьшим баллом из этой группы.`,
    columns: ["Территория", "Регион", "Должность", "Балл"],
    rows: rows.slice(0, 15).map((r) => ({
      cells: [
        r.territory_code,
        r.region_name ?? "—",
        r.position,
        formatScore(r.final_kpi_score),
      ],
    })),
  };
}

function answerCliff(): AskAnswer {
  const cliff = getCliffCandidates({}, 15);
  if (cliff.length === 0) {
    return {
      intent: "cliff",
      title: "Зона порога 100 баллов",
      text: "В диапазоне 85–100 баллов сотрудников сейчас нет.",
    };
  }
  const gain = cliff.reduce((s, c) => s + c.rate_gain, 0);
  const avgGap = cliff.reduce((s, c) => s + c.points_to_cliff, 0) / cliff.length;

  return {
    intent: "cliff",
    title: `Зона быстрого выигрыша: ${cliff.length} ${pluralRu(cliff.length, "сотрудник", "сотрудника", "сотрудников")}`,
    text:
      `На ${BONUS_CLIFF_SCORE} баллах ставка премии скачком растёт с ~9,9% до 20%. ` +
      `Если довести всю группу до порога, суммарная ставка вырастет на ${formatPoints(gain)} ` +
      `(в среднем ${formatPoints(gain / cliff.length)} на человека при дефиците ${formatScore(avgGap, 1)} балла).`,
    columns: ["Территория", "Регион", "Балл", "До порога", "Прирост ставки"],
    rows: cliff.map((r) => ({
      cells: [
        r.territory_code,
        r.region_name ?? "—",
        formatScore(r.final_kpi_score, 1),
        `+${formatScore(r.points_to_cliff, 1)}`,
        `+${formatPoints(r.rate_gain)}`,
      ],
    })),
  };
}

function answerPenalties(): AskAnswer {
  const { buckets, totals } = getPenaltyImpact({});
  const lost = totals.rate_before - totals.rate_after;
  const share = totals.rate_before > 0 ? lost / totals.rate_before : 0;
  const peopleShare =
    totals.people_total > 0 ? totals.people_penalised / totals.people_total : 0;

  return {
    intent: "penalties",
    title: "Штрафы по контрольным турам",
    text:
      `Штраф получили ${totals.people_penalised} из ${totals.people_total} ` +
      `(${formatPercent(peopleShare, 0)} команды). ` +
      `Удержания съедают ${formatPercent(share, 0)} бюджета премий ` +
      `(${formatPoints(lost)} суммарной ставки). ` +
      `Итоговая ставка = базовая × (1 − штраф).`,
    columns: ["Размер штрафа", "Сотрудников", "Удержано ставки"],
    rows: buckets.map((b) => ({
      cells: [
        formatPercent(b.penalty, 0),
        String(b.people),
        formatPoints(b.rate_lost),
      ],
    })),
  };
}

function answerMetrics(): AskAnswer {
  const metrics = getMetricAchievement({});
  const errors = getErrorRate({});
  const weakest = [...metrics].sort(
    (a, b) => a.achieve / a.target - b.achieve / b.target,
  )[0];

  return {
    intent: "metrics",
    title: "Выполнение по метрикам",
    text:
      (weakest
        ? `Наибольшее отставание — ${weakest.label}: ${formatPercent(weakest.achieve, 0)} при цели ${formatPercent(weakest.target, 0)}. `
        : "") +
      `Фактический уровень ошибок в точках — ${formatPercent(errors.error_rate, 2)} при цели ≤ 5% ` +
      `(${errors.above_target} из ${errors.measured} сотрудников выше цели).`,
    columns: ["Метрика", "Факт", "Цель"],
    rows: metrics.map((m) => ({
      cells: [m.label, formatPercent(m.achieve, 0), formatPercent(m.target, 0)],
    })),
  };
}

function answerTimeLoss(): AskAnswer {
  const time = getTimeLoss();
  const byTerritory = getTimeLossByTerritory(5);
  const topTerritories = byTerritory
    .map((t) => `${t.territory_code} (${t.region_name ?? "—"}) — ${formatHours(t.lost_hours)}`)
    .join("; ");

  return {
    intent: "time_loss",
    title: `Потери полевого времени — ${time.periodLabel}`,
    text:
      `Запланировано ${formatHours(time.lostHours)} вне полей — это ${formatPercent(time.lostShare, 1)} ` +
      `фонда рабочего времени (${time.workingDays} ${pluralRu(time.workingDays, "рабочий день", "рабочих дня", "рабочих дней")}, ` +
      `${time.roster} ${pluralRu(time.roster, "сотрудник", "сотрудника", "сотрудников")}). ` +
      (topTerritories
        ? `Больше всего потерь у: ${topTerritories}. `
        : "") +
      `В календаре отмечается только то, что отвлекает от полевой работы.`,
    columns: ["Тип активности", "Часы"],
    rows: time.byType.slice(0, 10).map((t) => ({
      cells: [t.name_ru, formatHours(t.hours)],
    })),
  };
}

function answerHelp(): AskAnswer {
  return {
    intent: "help",
    title: "Что можно спросить",
    text:
      "Я отвечаю по данным KPI за август 2026 и календарю активностей на сентябрь 2026. " +
      "Спрашивайте про лидеров и аутсайдеров, регионы, премии, штрафы, порог 100 баллов и потери времени. " +
      "ФИО в источнике нет — сотрудники указаны по коду территории.",
    suggestions: SUGGESTIONS,
  };
}

function answerUnknown(question: string): AskAnswer {
  return {
    intent: "unknown",
    title: "Не удалось распознать вопрос",
    text:
      `Пока не умею ответить на «${question.trim()}». ` +
      "Попробуйте одну из подсказок ниже — или переформулируйте через «топ-N», «лучший KPI», «регионы», «штрафы», «премии». " +
      "Для свободных формулировок подключите OPENAI_API_KEY в .env.local.",
    suggestions: SUGGESTIONS,
    source: "rules",
  };
}

/**
 * Логический ответ без LLM: опирается на зону порога и сводку,
 * когда вопрос не попал в жёсткие правила, но смысл управленческий.
 */
export function answerLogicalFallback(rawQuestion: string): AskAnswer {
  const q = normalize(rawQuestion);
  const cliff = answerCliff();
  const headline = getHeadline({});

  if (
    /(^|\s)(кого|кто)\b|дотяг|эффект|выигр|фокус|приоритет|куда смотреть|что делать|рекоменд|посовет/.test(
      q,
    )
  ) {
    return {
      ...cliff,
      intent: "logical_cliff",
      source: "logical",
      title: "Кого дотянуть для наибольшего эффекта",
      text:
        `Логический вывод по правилам премирования: наибольший эффект даёт доведение сотрудников до ${BONUS_CLIFF_SCORE} баллов — там ставка скачком растёт примерно вдвое.\n\n` +
        cliff.text,
    };
  }

  return {
    intent: "logical_headline",
    source: "logical",
    title: "Логический вывод по доступным данным",
    text:
      `В загруженных данных нет прямого ответа на «${rawQuestion.trim()}», но по сводке KPI картина такая.\n\n` +
      `Средний балл — ${formatScore(headline.avg_score, 1)}, ` +
      `норму ≥ ${BONUS_CLIFF_SCORE} выполнили ${headline.at_or_above_cliff} из ${headline.scored}, ` +
      `без премии — ${headline.below_bonus_threshold}. ` +
      `Практический фокус: зона 85–100 баллов (скачок ставки) и команды IBM с низкой долей ≥ 100.`,
    suggestions: SUGGESTIONS,
  };
}

function withRulesSource(answer: AskAnswer): AskAnswer {
  return { ...answer, source: answer.source ?? "rules" };
}

/**
 * Follow-up без LLM: по кодам территорий из предыдущего ответа ассистента
 * отвечает, у какого IBM сотрудник / показывает карточку территории.
 */
export function answerFollowUpFromHistory(
  rawQuestion: string,
  history: AskHistoryMessage[],
): AskAnswer | null {
  const q = normalize(rawQuestion);
  const aboutTeamOrIbm =
    /(ibm|команд|руководитель|менеджер|у кого|чей|чья|в какой)/.test(q);
  if (!aboutTeamOrIbm) return null;

  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === "assistant");
  if (!lastAssistant) return null;

  const codes = extractTerritoryCodes(lastAssistant.content);
  if (codes.length === 0) return null;

  // «этот аутсайдер / лидер» → первая территория из прошлого ответа
  const focusCode = codes[0];
  const all = [
    ...getTerritoryRanking({}, "bottom", 50),
    ...getTerritoryRanking({}, "top", 50),
  ];
  const person = all.find((r) => r.territory_code === focusCode);
  if (!person) return null;

  const ibm = person.ibm_name;
  if (!ibm) {
    return withRulesSource({
      intent: "followup_territory",
      title: `Территория ${person.territory_code}`,
      text:
        `В прошлом ответе речь шла о ${territoryLabel(person)} ` +
        `(балл ${formatScore(person.final_kpi_score)}). IBM в источнике для этой точки не указан.`,
    });
  }

  // Если спрашивают про команду — отдаём команду IBM с подсветкой человека
  if (/команд/.test(q)) {
    const team = answerIbmTeam(ibm);
    return withRulesSource({
      ...team,
      intent: "followup_ibm_team",
      title: `Команда IBM ${ibm}`,
      text:
        `Территория ${person.territory_code} (${person.region_name ?? "—"}, балл ${formatScore(person.final_kpi_score)}) ` +
        `относится к IBM ${ibm}.\n\n${team.text}`,
    });
  }

  return withRulesSource({
    intent: "followup_ibm",
    title: `IBM для ${person.territory_code}`,
    text:
      `Территория ${territoryLabel(person)} (балл ${formatScore(person.final_kpi_score)}) ` +
      `входит в команду IBM ${ibm}.`,
    suggestions: [
      `Какая команда у ${ibm}?`,
      "Кто в аутсайдерах по KPI?",
      "Сравни менеджеров IBM по KPI",
    ],
  });
}

/**
 * Главная точка входа: разбирает вопрос и возвращает ответ из хранилища.
 */
export function answerQuestion(rawQuestion: string): AskAnswer {
  const q = normalize(rawQuestion);
  if (!q || q.length < 2) return withRulesSource(answerHelp());

  if (
    /^(помощь|help|что умеешь|что можно|какие вопросы)/.test(q) ||
    q === "?"
  ) {
    return withRulesSource(answerHelp());
  }

  // Штрафы — раньше премий, чтобы «штрафы на премии» не ушли в bonus.
  if (aboutPenalty(q)) return withRulesSource(answerPenalties());

  // Порог 100 баллов / зона быстрого выигрыша / «кого дотянуть»
  if (aboutCliff(q)) return withRulesSource(answerCliff());

  // Без премии
  if (aboutNoBonus(q)) return withRulesSource(answerNoBonus());

  // Потери времени / календарь
  if (aboutTime(q)) return withRulesSource(answerTimeLoss());

  // Конкретный менеджер по фамилии из EVA
  const ibmName = findIbmName(q);
  if (ibmName && (aboutManagers(q) || /команд|точки|территор|у /.test(q))) {
    return withRulesSource(answerIbmTeam(ibmName));
  }

  // Сравнение менеджеров IBM
  if (aboutManagers(q) && !aboutRegions(q)) {
    const limit = extractLimit(q, 8);
    return withRulesSource(answerManagers(limit, isBottom(q)));
  }

  // Метрики / POSM / SKU / ошибки
  if (aboutMetrics(q) && !aboutKpi(q) && !aboutEmployees(q) && !aboutRegions(q)) {
    return withRulesSource(answerMetrics());
  }

  // Регионы
  if (aboutRegions(q)) {
    const limit = extractLimit(q, 5);
    return withRulesSource(answerTopRegions(limit, isBottom(q)));
  }

  // Сотрудники / территории по KPI
  if (
    aboutEmployees(q) ||
    (aboutKpi(q) && (/(топ|лучш|худш|лидер|аутсайд)/.test(q) || isBottom(q)))
  ) {
    const limit = extractLimit(q, /(топ)/.test(q) ? 5 : 1);
    return withRulesSource(answerTopEmployees(limit, isBottom(q)));
  }

  // Общая сводка / средние
  if (aboutAverage(q) || (aboutBonus(q) && !/(топ|лучш|худш)/.test(q))) {
    return withRulesSource(answerHeadline());
  }

  // «Топ-5 по KPI» без явного «сотрудник/регион» — по умолчанию сотрудники
  if (/топ/.test(q) && (aboutKpi(q) || aboutBonus(q) || q.length < 40)) {
    const limit = extractLimit(q, 5);
    return withRulesSource(answerTopEmployees(limit, isBottom(q)));
  }

  // «Лучший KPI» без уточнения
  if (/(лучш|худш).*(kpi|кпи|балл)|у кого.*(лучш|больш)/.test(q)) {
    return withRulesSource(
      answerTopEmployees(extractLimit(q, 1), isBottom(q)),
    );
  }

  return answerUnknown(rawQuestion);
}

export function getAskSuggestions(): string[] {
  return SUGGESTIONS;
}
