/**
 * История диалога внутри одной сессии «Спросить данные».
 * Клиент шлёт последние реплики; сервер использует их для follow-up и LLM.
 */

export type AskHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  intent?: string;
};

const MAX_TURNS = 12; // пар user+assistant ≈ 6 обменов
const MAX_CONTENT = 1200;

export function isFollowUpQuestion(raw: string): boolean {
  const q = raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

  return (
    /(^|\s)(а |и |ну )?(этот|эта|эти|этого|этой|этих|него|нее|них|нему|ней|ним|тот|та|те|того|той)\b/.test(
      q,
    ) ||
    /(выше|предыдущ|тот же|та же|те же|про него|про нее|про них|из них|из списка|из таблицы)/.test(
      q,
    ) ||
    /(у какого ibm|какой ibm|чья команда|чьей команде|в какой команде|кто (его|ее|их) (ibm|руководитель|менеджер)|аутсайдер.*(команд|ibm)|лидер.*(команд|ibm))/.test(
      q,
    ) ||
    /^(а |и )?(кто|где|какой|какая|какие|чей|чья|чьё|чье)\b/.test(q)
  );
}

/** Нормализует и обрезает историю из тела запроса. */
export function parseHistory(raw: unknown): AskHistoryMessage[] {
  if (!Array.isArray(raw)) return [];

  const out: AskHistoryMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    const intent = (item as { intent?: unknown }).intent;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({
      role,
      content: content.trim().slice(0, MAX_CONTENT),
      intent: typeof intent === "string" ? intent : undefined,
    });
  }
  return out.slice(-MAX_TURNS);
}

/** Компактный текст ответа для истории (без огромных таблиц). */
export function compactAnswerForHistory(answer: {
  title: string;
  text: string;
  intent?: string;
  columns?: string[];
  rows?: { cells: string[] }[];
}): string {
  const lines = [answer.title, answer.text];
  if (answer.columns?.length && answer.rows?.length) {
    lines.push(answer.columns.join(" | "));
    for (const row of answer.rows.slice(0, 8)) {
      lines.push(row.cells.join(" | "));
    }
    if (answer.rows.length > 8) {
      lines.push(`… ещё ${answer.rows.length - 8} строк`);
    }
  }
  return lines.join("\n").slice(0, MAX_CONTENT);
}

/** Достаёт коды территорий из текста предыдущего ответа ассистента. */
export function extractTerritoryCodes(content: string): string[] {
  const codes = content.match(/\b\d{6,8}\b/g) ?? [];
  return [...new Set(codes)];
}
