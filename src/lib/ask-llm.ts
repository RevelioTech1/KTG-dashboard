import { ASK_SYSTEM_PROMPT, buildAskContext } from "./ask-context";
import type { AskAnswer } from "./ask";

export type LlmStatus = {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  reason?: string;
};

export function getLlmStatus(): LlmStatus {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      enabled: false,
      provider: null,
      model: null,
      reason: "Не задан OPENAI_API_KEY в .env.local",
    };
  }
  return {
    enabled: true,
    provider: process.env.OPENAI_BASE_URL?.trim() ? "openai-compatible" : "openai",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  };
}

/**
 * Ответ через OpenAI-compatible Chat Completions.
 * Подходит и для OpenAI, и для совместимых провайдеров (OPENAI_BASE_URL).
 */
export async function answerWithLlm(question: string): Promise<AskAnswer | null> {
  const status = getLlmStatus();
  if (!status.enabled || !status.model) return null;

  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const context = buildAskContext();

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
        messages: [
          { role: "system", content: ASK_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${context}\n\n---\n\nВопрос руководителя:\n${question.trim()}`,
          },
        ],
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

    // Заголовок — первая строка или усечённый вопрос
    const firstLine = text.split("\n").find((l) => l.trim()) ?? "Ответ";
    const title =
      firstLine.replace(/^#+\s*/, "").slice(0, 80) || "Ответ по данным";

    return {
      intent: "llm",
      title: title.length < 60 && !title.includes(".") ? title : "Ответ",
      text,
      suggestions: [
        "Кого дотянуть до 100 баллов для наибольшего эффекта?",
        "Сравни менеджеров IBM по KPI",
        "Какие регионы требуют внимания?",
        "Как штрафы влияют на премии?",
      ],
    };
  } catch (error) {
    console.error("LLM call failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
