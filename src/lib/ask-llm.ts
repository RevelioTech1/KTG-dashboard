import { ASK_SYSTEM_PROMPT, buildAskContext } from "./ask-context";
import type { AskAnswer } from "./ask";
import type { AskHistoryMessage } from "./ask-history";
import { getRuntimeEnv } from "./runtime-env";

export type LlmStatus = {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
};

export function getLlmStatus(): LlmStatus {
  const key = getRuntimeEnv("OPENAI_API_KEY");
  if (!key) {
    return {
      enabled: false,
      provider: null,
      model: null,
      reason:
        "Не задан OPENAI_API_KEY (.env.local локально или wrangler secret на Workers)",
    };
  }
  const baseUrl = getRuntimeEnv("OPENAI_BASE_URL");
  return {
    enabled: true,
    provider: baseUrl ? "openai-compatible" : "openai",
    model: getRuntimeEnv("OPENAI_MODEL") || "gpt-4o-mini",
  };
}

/**
 * Ответ через OpenAI-compatible Chat Completions.
 * history — предыдущие реплики текущей сессии диалога.
 */
export async function answerWithLlm(
  question: string,
  history: AskHistoryMessage[] = [],
): Promise<AskAnswer | null> {
  const status = getLlmStatus();
  if (!status.enabled || !status.model) return null;

  const apiKey = getRuntimeEnv("OPENAI_API_KEY")!;
  const baseUrl = (
    getRuntimeEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const context = await buildAskContext();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: ASK_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `${context}\n\n---\n\nНиже — продолжение диалога с руководителем. ` +
        `Учитывай предыдущие реплики: местоимения («этот», «он», «аутсайдер») ` +
        `относятся к людям/регионам из истории. Не проси повторить вопрос, если ответ есть в истории или контексте данных.`,
    },
    {
      role: "assistant",
      content:
        "Контекст данных принял. Буду опираться на него и на историю диалога; цифры не выдумаю.",
    },
  ];

  for (const turn of history) {
    messages.push({
      role: turn.role,
      content: turn.content,
    });
  }

  messages.push({
    role: "user",
    content: question.trim(),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: status.model,
        temperature: 0.2,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("LLM HTTP error", res.status, body.slice(0, 400));
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    const firstLine = text.split("\n").find((l) => l.trim()) ?? "Ответ";
    const title =
      firstLine.replace(/^#+\s*/, "").slice(0, 80) || "Ответ по данным";

    return {
      intent: "llm",
      title: title.length < 60 && !title.includes(".") ? title : "Ответ",
      text,
      suggestions: [
        "У какого IBM этот сотрудник?",
        "Кого дотянуть до 100 баллов для наибольшего эффекта?",
        "Сравни менеджеров IBM по KPI",
        "Какие регионы требуют внимания?",
      ],
    };
  } catch (error) {
    console.error("LLM call failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
