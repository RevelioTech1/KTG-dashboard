/**
 * Компактный контекст хранилища для LLM: только агрегаты и короткие рейтинги,
 * без выгрузки всей базы в промпт.
 */
import {
  getCliffCandidates,
  getErrorRate,
  getHeadline,
  getIbmPerformance,
  getMetricAchievement,
  getPenaltyImpact,
  getPeriods,
  getRegionPerformance,
  getTerritoryRanking,
  getTimeLoss,
} from "./queries";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS, incentiveRateForScore } from "./incentive";
import { formatPercent, formatScore, formatHours } from "./format";

export async function buildAskContext(): Promise<string> {
  const periods = await getPeriods();
  const headline = await getHeadline({});
  const managers = await getIbmPerformance({});
  const regions = (await getRegionPerformance({}, 2)).slice(0, 10);
  const top = await getTerritoryRanking({}, "top", 8);
  const bottom = await getTerritoryRanking({}, "bottom", 8);
  const cliff = await getCliffCandidates({}, 15);
  const metrics = await getMetricAchievement({});
  const penalties = await getPenaltyImpact({});
  const errors = (await getErrorRate({}))!;
  const time = await getTimeLoss();

  const shareAbove = headline.scored > 0 ? headline.at_or_above_cliff / headline.scored : 0;
  const shareNoBonus =
    headline.scored > 0 ? headline.below_bonus_threshold / headline.scored : 0;

  const lines: string[] = [];
  lines.push("# Контекст данных торговой команды");
  lines.push(
    `Периоды: ${periods.map((p) => `${p.label_ru} (${p.source_file})`).join("; ")}`,
  );
  lines.push(
    "Иерархия: IBM (фамилия руководителя направления) → BDM/RKAM (свёртка) → TSM/JTSM/KPP Activator (исполнители/точки).",
  );
  lines.push(
    "ВАЖНО: ФИО исполнителей в источнике нет (#REF!). Идентификация — код территории + регион + должность.",
  );
  lines.push(
    "Показатели эффективности считаются только по исполнителям (без строк BDM/RKAM).",
  );
  lines.push("");
  lines.push("## Правила премирования (проверены на всех строках EVA)");
  lines.push(`- ниже ${MIN_SCORE_FOR_BONUS} баллов → премии нет`);
  lines.push(
    `- ${MIN_SCORE_FOR_BONUS}–99.9: рост ~2.5% на 10 баллов (на 99 баллах ≈ 9.9%)`,
  );
  lines.push(
    `- с ${BONUS_CLIFF_SCORE} баллов: ставка = балл × 0.2% (на 100 → 20%, на 200 → 40%) — СКАЧОК примерно в 2 раза`,
  );
  lines.push("- итоговая ставка = базовая × (1 − штраф по контрольным турам)");
  lines.push(
    `- пример: балл 97 → ставка ${formatPercent(incentiveRateForScore(97))}; балл 100 → ${formatPercent(incentiveRateForScore(100))}`,
  );
  lines.push("");
  lines.push("## Сводка KPI (август)");
  lines.push(
    `- сотрудников с баллом: ${headline.scored}; средний ${formatScore(headline.avg_score, 1)}; медиана ${formatScore(headline.median_score, 1)}`,
  );
  lines.push(
    `- выполнили норму ≥${BONUS_CLIFF_SCORE}: ${headline.at_or_above_cliff} (${formatPercent(shareAbove, 0)})`,
  );
  lines.push(
    `- без премии <${MIN_SCORE_FOR_BONUS}: ${headline.below_bonus_threshold} (${formatPercent(shareNoBonus, 0)})`,
  );
  lines.push(
    `- средняя базовая ставка ${formatPercent(headline.avg_rate)}; итоговая ${formatPercent(headline.avg_final_rate)}; со штрафом ${headline.with_penalty}`,
  );
  lines.push("");
  lines.push("## Менеджеры IBM (средний балл команды)");
  for (const m of managers) {
    lines.push(
      `- ${m.ibm_name}: ср.балл ${formatScore(m.avg_score, 1)}, команда ${m.people}, ≥100 ${formatPercent(m.share_above_cliff, 0)}, без премии ${m.below_bonus}, со штрафом ${m.with_penalty}, ставка ${formatPercent(m.avg_final_rate)}`,
    );
  }
  lines.push("");
  lines.push("## Топ регионов (от 2 сотрудников)");
  for (const r of regions.slice(0, 8)) {
    lines.push(
      `- ${r.region_name}: ср.балл ${formatScore(r.avg_score, 1)}, n=${r.people}, ≥100 ${formatPercent(r.share_above_cliff, 0)}`,
    );
  }
  lines.push("");
  lines.push("## Топ территорий по баллу");
  for (const t of top) {
    lines.push(
      `- ${t.territory_code} ${t.position} ${t.region_name ?? "—"} IBM=${t.ibm_name ?? "—"}: ${formatScore(t.final_kpi_score)}, ставка ${formatPercent(t.final_incentive_rate)}`,
    );
  }
  lines.push("");
  lines.push("## Аутсайдеры по баллу");
  for (const t of bottom) {
    lines.push(
      `- ${t.territory_code} ${t.position} ${t.region_name ?? "—"} IBM=${t.ibm_name ?? "—"}: ${formatScore(t.final_kpi_score)}, штраф ${formatPercent(t.tour_penalty ?? 0, 0)}`,
    );
  }
  lines.push("");
  lines.push(
    `## Зона быстрого выигрыша (балл ${BONUS_CLIFF_SCORE - 15}–${BONUS_CLIFF_SCORE}): дотянуть до ${BONUS_CLIFF_SCORE} даёт скачок ставки`,
  );
  if (cliff.length === 0) {
    lines.push("- пусто");
  } else {
    for (const c of cliff) {
      lines.push(
        `- ${c.territory_code} ${c.region_name ?? "—"}: балл ${formatScore(c.final_kpi_score, 1)}, до порога +${formatScore(c.points_to_cliff, 1)}, прирост ставки +${formatPercent(c.rate_gain)}`,
      );
    }
  }
  lines.push("");
  lines.push("## Метрики исполнения");
  for (const m of metrics) {
    lines.push(
      `- ${m.label}: факт ${formatPercent(m.achieve, 0)} / цель ${formatPercent(m.target, 0)}${m.note ? ` (${m.note})` : ""}`,
    );
  }
  lines.push(
    `- ошибки в точках: ${formatPercent(errors.error_rate, 2)} (цель ≤5%), выше цели ${errors.above_target} из ${errors.measured}`,
  );
  lines.push("");
  lines.push("## Штрафы");
  lines.push(
    `- получили штраф: ${penalties.totals.people_penalised} из ${penalties.totals.people_total}`,
  );
  for (const b of penalties.buckets) {
    lines.push(`- штраф ${formatPercent(b.penalty, 0)}: ${b.people} чел.`);
  }
  lines.push("");
  lines.push(`## Потери полевого времени (${time.periodLabel})`);
  lines.push(
    `- потеряно ${formatHours(time.lostHours)} = ${formatPercent(time.lostShare, 1)} фонда; roster ${time.roster}`,
  );
  for (const t of time.byType.slice(0, 8)) {
    lines.push(`- ${t.name_ru}: ${formatHours(t.hours)}`);
  }
  lines.push("");
  lines.push("## Ограничения данных");
  lines.push("- Абсолютных сумм премий в рублях нет: нет окладов, только % от оклада.");
  lines.push("- CA = сентябрь (календарь), EVA = август (KPI); состав территорий между месяцами различается.");
  lines.push("- Из одного CA восстановить EVA невозможно: в CA нет метрик результата.");

  return lines.join("\n");
}

export const ASK_SYSTEM_PROMPT = `Ты аналитик управленческого дашборда эффективности торговой команды в России.

Отвечай на русском, кратко и по делу (обычно 1–3 абзаца). Структура ответа:
1) Прямой ответ на вопрос
2) Цифры из контекста или из истории диалога (если есть)
3) Практическая рекомендация, если уместно

Правила:
- Опирайся прежде всего на блок «Контекст данных» и на историю текущей сессии. Не выдумывай коды территорий, баллы и проценты, которых там нет.
- Follow-up вопросы («этот аутсайдер», «а у какого IBM», «в какой команде») относятся к людям/строкам из предыдущих ответов в истории. Связывай местоимения с конкретным кодом территории.
- Если точных цифр нет, явно напиши: «В загруженных данных этого нет» и дай логический вывод / гипотезу на основе правил премирования и имеющихся паттернов. Помечай такие части как «логический вывод».
- Сотрудников называй по коду территории (и региону/должности/IBM), не выдумывай ФИО.
- Вопросы вроде «кого дотянуть для наибольшего эффекта» обычно про зону быстрого выигрыша у порога 100 баллов — там ставка премии скачком удваивается.
- Не говори, что ты языковая модель, если не спрашивают. Не предлагай выдумать данные.`;
