import { Database, FileSpreadsheet } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { Section, Insight } from "@/components/section";
import { DashboardFilters } from "@/components/dashboard-filters";
import { ScoreDistribution } from "@/components/charts/score-distribution";
import { RegionPerformanceChart } from "@/components/charts/region-performance";
import { MetricAchievementBars } from "@/components/charts/metric-achievement";
import { PenaltyImpactChart } from "@/components/charts/penalty-impact";
import { TimeLossChart } from "@/components/charts/time-loss";
import { RankingTable } from "@/components/ranking-table";
import { CliffTable } from "@/components/cliff-table";
import { DataQualityList } from "@/components/data-quality";
import { WarehouseMissing } from "@/components/warehouse-missing";

import { warehouseExists } from "@/lib/db";
import {
  getCliffCandidates,
  getDataQuality,
  getErrorRate,
  getFilterOptions,
  getHeadline,
  getMetricAchievement,
  getPenaltyImpact,
  getPeriods,
  getRegionPerformance,
  getScoreBands,
  getTerritoryRanking,
  getTimeLoss,
  type Filters,
} from "@/lib/queries";
import { BONUS_CLIFF_SCORE, MIN_SCORE_FOR_BONUS } from "@/lib/incentive";
import { formatHours, formatPercent, formatPoints, formatScore, pluralRu } from "@/lib/format";

const ERROR_RATE_TARGET = 0.05;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!warehouseExists()) return <WarehouseMissing />;

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const filters: Filters = {
    region: single("region"),
    position: single("position"),
    ibm: single("ibm"),
  };

  const periods = getPeriods();
  const options = getFilterOptions();
  const headline = getHeadline(filters);
  const bands = getScoreBands(filters);
  const metrics = getMetricAchievement(filters);
  const errors = getErrorRate(filters);
  const regions = getRegionPerformance(filters);
  const penalties = getPenaltyImpact(filters);
  const cliff = getCliffCandidates(filters);
  const top = getTerritoryRanking(filters, "top");
  const bottom = getTerritoryRanking(filters, "bottom");
  const timeLoss = getTimeLoss();
  const quality = getDataQuality();

  const factPeriod = periods[0];
  const planPeriod = periods[periods.length - 1];

  const shareAboveCliff = headline.scored > 0 ? headline.at_or_above_cliff / headline.scored : 0;
  const shareNoBonus =
    headline.scored > 0 ? headline.below_bonus_threshold / headline.scored : 0;
  const rateLostToPenalty = headline.avg_rate - headline.avg_final_rate;
  const penaltyShareOfFund =
    headline.avg_rate > 0 ? rateLostToPenalty / headline.avg_rate : 0;
  const cliffRateGain = cliff.reduce((sum, c) => sum + c.rate_gain, 0);
  const weakestMetric = [...metrics].sort(
    (a, b) => a.achieve / a.target - b.achieve / b.target,
  )[0];

  const hasFilters = Boolean(filters.region || filters.position || filters.ibm);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-8">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Executive dashboard
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Эффективность торговой команды
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Факт по KPI и премированию за {factPeriod.label_ru.toLowerCase()} и план загрузки на{" "}
          {planPeriod.label_ru.toLowerCase()}. Показатели считаются по исполнителям
          (TSM, JTSM, KPP Activator); строки BDM и RKAM в источнике — свёртка команды,
          поэтому в средние они не входят.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <DashboardFilters options={options} />
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <FileSpreadsheet className="size-3.5" />
            {periods.map((p) => p.source_file).join(" · ")}
          </span>
        </div>
      </header>

      {headline.scored === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center">
          <p className="font-medium">Под выбранные фильтры данных нет</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Снимите часть фильтров, чтобы увидеть показатели.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Средний балл KPI"
              value={formatScore(headline.avg_score, 1)}
              unit="из 200"
              tone={headline.avg_score >= BONUS_CLIFF_SCORE ? "good" : "warn"}
              context={`Медиана ${formatScore(headline.median_score, 1)}`}
              footnote={`${headline.scored} ${pluralRu(headline.scored, "сотрудник", "сотрудника", "сотрудников")} с рассчитанным баллом`}
            />
            <KpiCard
              label="Выполнили норму (≥ 100 баллов)"
              value={formatPercent(shareAboveCliff, 0)}
              tone={shareAboveCliff >= 0.8 ? "good" : "warn"}
              context={`${headline.at_or_above_cliff} из ${headline.scored} ${pluralRu(headline.scored, "сотрудника", "сотрудников", "сотрудников")}`}
              footnote="На 100 баллах ставка премии удваивается"
            />
            <KpiCard
              label="Остались без премии (< 80 баллов)"
              value={formatPercent(shareNoBonus, 0)}
              tone={shareNoBonus > 0.15 ? "bad" : "good"}
              context={`${headline.below_bonus_threshold} ${pluralRu(headline.below_bonus_threshold, "сотрудник", "сотрудника", "сотрудников")}`}
              footnote={`Ниже ${MIN_SCORE_FOR_BONUS} баллов премия не начисляется`}
            />
            <KpiCard
              label="Итоговая ставка премии"
              value={formatPercent(headline.avg_final_rate)}
              unit="от оклада"
              context={`Базовая ${formatPercent(headline.avg_rate)}, штрафы снизили на ${formatPoints(rateLostToPenalty)}`}
              footnote="Абсолютные суммы требуют данных по окладам — их в файлах нет"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Section
                title="Распределение по баллам и зонам премирования"
                description="Цвет показывает, в какую зону премирования попадает сотрудник. Между 90–100 и 100–120 баллами проходит ступень, на которой ставка меняется скачком."
              >
                <ScoreDistribution data={bands} />
                <Insight>
                  <strong>
                    {headline.below_bonus_threshold}{" "}
                    {pluralRu(
                      headline.below_bonus_threshold,
                      "сотрудник",
                      "сотрудника",
                      "сотрудников",
                    )}
                  </strong>{" "}
                  не набрали {MIN_SCORE_FOR_BONUS} баллов и не получат премию вовсе. Это самая
                  крупная группа риска: она не создаёт экономии, а напрямую влияет на
                  удержание людей.
                </Insight>
              </Section>
            </div>

            <div className="lg:col-span-2">
              <Section
                title="Выполнение по метрикам"
                description="Каждая метрика сравнивается со своей целью: часть KPI имеет цель ниже 100% по дизайну схемы."
              >
                <MetricAchievementBars data={metrics} />
                {weakestMetric ? (
                  <Insight>
                    Наибольшее отставание от цели — <strong>{weakestMetric.label}</strong>:{" "}
                    {formatPercent(weakestMetric.achieve, 0)} при цели{" "}
                    {formatPercent(weakestMetric.target, 0)}.
                  </Insight>
                ) : null}
              </Section>
            </div>
          </div>

          <Section
            title={`Зона быстрого выигрыша: ${cliff.length} ${pluralRu(cliff.length, "сотрудник", "сотрудника", "сотрудников")} у порога 100 баллов`}
            description={`Ставка премии растёт с ~9,9% на 99 баллах до 20% на 100 баллах. Этим сотрудникам до порога не хватает считанных баллов, поэтому отдача от работы с ними максимальна.`}
          >
            <CliffTable rows={cliff} />
            {cliff.length > 0 ? (
              <Insight>
                Если довести всю группу до 100 баллов, суммарная ставка премии вырастет на{" "}
                <strong>{formatPoints(cliffRateGain)}</strong> — в среднем{" "}
                {formatPoints(cliffRateGain / cliff.length)} на человека при дефиците всего{" "}
                {formatScore(
                  cliff.reduce((s, c) => s + c.points_to_cliff, 0) / cliff.length,
                  1,
                )}{" "}
                балла.
              </Insight>
            ) : null}
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Регионы по среднему баллу"
              description="Включены регионы, где работает не меньше двух сотрудников, иначе средние неустойчивы."
            >
              <RegionPerformanceChart data={regions} />
            </Section>

            <Section
              title="Штрафы по контрольным турам"
              description="Штраф срезает уже начисленную премию: итоговая ставка = базовая × (1 − штраф)."
            >
              <PenaltyImpactChart data={penalties.buckets} />
              <Insight>
                Штраф получили <strong>{headline.with_penalty}</strong> из {headline.scored}{" "}
                {pluralRu(headline.scored, "сотрудника", "сотрудников", "сотрудников")} — это{" "}
                {formatPercent(headline.with_penalty / headline.scored, 0)}{" "}
                команды. Удержания съедают {formatPercent(penaltyShareOfFund, 0)} бюджета
                премий, то есть это системная проблема процесса, а не отдельные нарушения.
              </Insight>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Лидеры" description="10 территорий с наибольшим баллом.">
              <RankingTable rows={top} />
            </Section>
            <Section
              title="Требуют вмешательства"
              description="10 территорий с наименьшим баллом."
            >
              <RankingTable rows={bottom} />
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Section
                title={`Потери полевого времени — план на ${timeLoss.periodLabel.toLowerCase()}`}
                description={`${timeLoss.workingDays} ${pluralRu(timeLoss.workingDays, "рабочий день", "рабочих дня", "рабочих дней")}, ${timeLoss.roster} ${pluralRu(timeLoss.roster, "сотрудник", "сотрудника", "сотрудников")} в календаре. Фонд времени ${formatHours(timeLoss.capacityHours)}; в календаре отмечается только то, что отвлекает от работы в полях.`}
              >
                <TimeLossChart data={timeLoss.byType} capacityHours={timeLoss.capacityHours} />
                <Insight>
                  Запланировано {formatHours(timeLoss.lostHours)} вне полей — это{" "}
                  <strong>{formatPercent(timeLoss.lostShare, 1)}</strong> фонда рабочего
                  времени. Фильтры дашборда к этому блоку не применяются: календарь относится
                  к следующему периоду и к другому составу команды.
                </Insight>
              </Section>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <Section
                title="Качество выкладки"
                description="Доля точек с ошибками при цели не выше 5%."
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-semibold ${
                      errors.error_rate <= ERROR_RATE_TARGET ? "text-chart-5" : "text-destructive"
                    }`}
                  >
                    {formatPercent(errors.error_rate, 2)}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    цель ≤ {formatPercent(ERROR_RATE_TARGET, 0)}
                  </span>
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Проверено точек</dt>
                    <dd className="font-medium tabular-nums">{formatScore(errors.covered_pos)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Точек с ошибками</dt>
                    <dd className="font-medium tabular-nums">{formatScore(errors.mistakes)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Сотрудников выше цели</dt>
                    <dd className="text-destructive font-medium tabular-nums">
                      {errors.above_target} из {errors.measured}
                    </dd>
                  </div>
                </dl>
                <Insight>
                  В среднем команда в цель укладывается, но у {errors.above_target}{" "}
                  {pluralRu(errors.above_target, "сотрудника", "сотрудников", "сотрудников")}{" "}
                  уровень ошибок выше 5% — средняя величина скрывает локальные проблемы.
                </Insight>
              </Section>

              <Section
                title="Качество данных"
                description="Выявлено при загрузке источников. Требует решения владельца данных."
              >
                <DataQualityList issues={quality} />
              </Section>
            </div>
          </div>
        </div>
      )}

      <footer className="text-muted-foreground mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-5 text-xs">
        <span className="flex items-center gap-1.5">
          <Database className="size-3.5" />
          Источник: локальное хранилище SQLite, пересобирается командой{" "}
          <code className="font-mono">npm run etl</code>
        </span>
        {hasFilters ? <span>Фильтры применены к блокам по KPI и премиям</span> : null}
      </footer>
    </div>
  );
}

// Хранилище читается на каждый запрос, чтобы дашборд отражал последний прогон ETL.
export const dynamic = "force-dynamic";
