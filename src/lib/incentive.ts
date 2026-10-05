/**
 * Модель премирования, восстановленная из файла EVA и проверенная на всех 141
 * строке с рассчитанной ставкой (scripts/verify_incentive.ts, 0 расхождений).
 *
 * Шапка листа «Rating 08» задаёт два наклона — «2.5% per 10 Point» ниже 100 баллов
 * и «2.0% per 10 Point» от 100 баллов и выше:
 *
 *   балл < 80          -> премии нет
 *   80 <= балл < 90    -> 5.0% + (балл - 80) * 0.25%     (2.5% на 10 баллов)
 *   90 <= балл < 100   -> 7.5% + (балл - 90) * 0.25%     (до 9.9% на 99.6 балла)
 *   балл >= 100        -> балл * 0.2%                    (20% на 100, 40% на 200)
 *
 * Отсюда главный управленческий вывод: на 100 баллах ставка скачком растёт
 * с ~9.9% до 20%. Сотрудник, не дотянувший до 100, теряет половину премии,
 * поэтому именно эта группа даёт наибольшую отдачу от доработки.
 */

export const MIN_SCORE_FOR_BONUS = 80;
export const BONUS_CLIFF_SCORE = 100;

export function incentiveRateForScore(score: number): number {
  if (score < MIN_SCORE_FOR_BONUS) return 0;
  if (score < 90) return 0.05 + ((score - 80) / 10) * 0.025;
  if (score < BONUS_CLIFF_SCORE) return 0.075 + ((score - 90) / 10) * 0.025;
  return (score / 100) * 0.2;
}

/** Итоговая ставка после штрафа по контрольным турам. */
export function finalIncentiveRate(score: number, tourPenalty: number): number {
  return incentiveRateForScore(score) * (1 - tourPenalty);
}

/** Шкала для подписи осей и легенд. */
export const INCENTIVE_SCALE_POINTS = [
  { score: 80, rate: 0.05 },
  { score: 90, rate: 0.075 },
  { score: 100, rate: 0.2 },
  { score: 120, rate: 0.24 },
  { score: 140, rate: 0.28 },
  { score: 160, rate: 0.32 },
  { score: 180, rate: 0.36 },
  { score: 200, rate: 0.4 },
];
