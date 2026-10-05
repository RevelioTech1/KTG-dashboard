const numberFormat = new Intl.NumberFormat("ru-RU");

export function formatScore(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Доля 0..1 -> «19,1%». */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Разница долей 0..1 -> «2,0 п.п.». */
export function formatPoints(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} п.п.`;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return numberFormat.format(Math.round(value));
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${numberFormat.format(Math.round(value))} ч`;
}

/**
 * Подпись на графике. Повторяет RenderableText из recharts, но объявлена здесь,
 * чтобы модуль форматирования не зависел от библиотеки графиков и мог
 * использоваться в серверном коде.
 */
type ChartLabel = string | number | boolean | null | undefined;

/**
 * Значение подписи приводится к числу перед форматированием, нечисловые подписи
 * скрываются.
 */
export function labelFormatter(
  format: (value: number) => string,
): (value: ChartLabel) => string {
  return (value) => {
    if (typeof value !== "number" && typeof value !== "string") return "";
    const n = Number(value);
    return Number.isFinite(n) ? format(n) : "";
  };
}

/** Склонение существительного: pluralRu(3, 'сотрудник', 'сотрудника', 'сотрудников'). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
