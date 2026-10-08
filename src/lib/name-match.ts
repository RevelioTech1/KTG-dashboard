/**
 * Сопоставление фамилий IBM: в источнике латиница (Zolotarev Evgeniy),
 * в вопросах часто кириллица и падежи («Золоторева Евгения»).
 */

const CYR_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toLatinSkeleton(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, "е")
    .split("")
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

/** Снимает типичные русские падежные окончания после транслита. */
function stripRuCaseEnding(lat: string): string {
  const caseEndings = [
    "ogo",
    "emu",
    "oyu",
    "eyu",
    "uyu",
    "aya",
    "oy",
    "ey",
    "om",
    "em",
    "yu",
    "ya",
    "u",
    "a",
    "e",
    "y",
    "i",
  ];
  for (const end of caseEndings) {
    if (lat.length > end.length + 3 && lat.endsWith(end)) {
      return lat.slice(0, -end.length);
    }
  }
  return lat;
}

/**
 * Сглаживает частые расхождения транслита:
 * Zolotarev ↔ Золоторев, Evgeniy ↔ Евгения, Dulitskiy ↔ Дулицкий.
 */
function soften(lat: string): string {
  return lat
    .replace(/yo/g, "e")
    .replace(/iy$/g, "i")
    .replace(/yy$/g, "i")
    .replace(/y$/g, "i")
    .replace(/[aoe]/g, "e");
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zA-Zа-яА-Я]+/)
    .filter((t) => t.length >= 3)
    .map((t) => soften(stripRuCaseEnding(toLatinSkeleton(t))))
    .filter((t) => t.length >= 3);
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.startsWith(a)) return true;
  if (b.length >= 4 && a.startsWith(b)) return true;
  // одна ошибка транслита на длинных фамилиях
  if (a.length >= 6 && b.length >= 6 && Math.abs(a.length - b.length) <= 1) {
    let diff = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
    diff += Math.abs(a.length - b.length);
    if (diff <= 1) return true;
  }
  return false;
}

/**
 * Находит имя IBM из списка по вопросу на русском или английском.
 * Возвращает каноническое имя из источника или null.
 */
export function matchIbmName(
  question: string,
  ibmNames: string[],
): string | null {
  const qTokens = tokens(question);
  if (qTokens.length === 0) return null;

  let best: { name: string; score: number } | null = null;

  for (const name of ibmNames) {
    const nameTokens = tokens(name);
    if (nameTokens.length === 0) continue;

    const surname = [...nameTokens].sort((a, b) => b.length - a.length)[0];
    const surnameHit = qTokens.some((qt) => tokenMatch(qt, surname));
    if (!surnameHit) continue;

    let hits = 0;
    for (const nt of nameTokens) {
      if (qTokens.some((qt) => tokenMatch(qt, nt))) hits += 1;
    }

    const score = hits * 10 + surname.length;
    if (!best || score > best.score) best = { name, score };
  }

  return best?.name ?? null;
}
