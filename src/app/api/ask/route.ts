import { NextResponse } from "next/server";
import { warehouseExists } from "@/lib/db";
import {
  answerFollowUpFromHistory,
  answerLogicalFallback,
  answerQuestion,
  getAskSuggestions,
} from "@/lib/ask";
import {
  answerWithLlm,
  getLlmStatus,
  shouldPreferLlm,
} from "@/lib/ask-llm";
import { isFollowUpQuestion, parseHistory } from "@/lib/ask-history";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    suggestions: getAskSuggestions(),
    llm: await getLlmStatus(),
  });
}

export async function POST(request: Request) {
  if (!(await warehouseExists())) {
    return NextResponse.json(
      { error: "Хранилище данных не собрано. Запустите npm run etl." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const question =
    typeof body === "object" &&
    body !== null &&
    "question" in body &&
    typeof (body as { question: unknown }).question === "string"
      ? (body as { question: string }).question
      : "";

  const history = parseHistory(
    typeof body === "object" && body !== null && "history" in body
      ? (body as { history: unknown }).history
      : [],
  );

  if (!question.trim()) {
    return NextResponse.json({ error: "Пустой вопрос" }, { status: 400 });
  }

  if (question.length > 500) {
    return NextResponse.json(
      { error: "Вопрос слишком длинный (максимум 500 символов)" },
      { status: 400 },
    );
  }

  try {
    const llmStatus = await getLlmStatus();
    const followUp = history.length > 0 && isFollowUpQuestion(question);

    // Follow-up в сессии: сначала нейросеть с историей, иначе правила по кодам из прошлого ответа.
    if (followUp) {
      if (llmStatus.enabled) {
        const llmAnswer = await answerWithLlm(question, history);
        if (llmAnswer) {
          return NextResponse.json({
            question: question.trim(),
            answer: { ...llmAnswer, source: "llm" as const },
            llm: llmStatus,
          });
        }
      }

      const fromHistory = await answerFollowUpFromHistory(question, history);
      if (fromHistory) {
        return NextResponse.json({
          question: question.trim(),
          answer: fromHistory,
          llm: llmStatus,
        });
      }
    }

    const rulesAnswer = await answerQuestion(question);

    // Уточнения и «мягкие» вопросы — нейросеть с полным контекстом (если ключ есть).
    if (llmStatus.enabled && shouldPreferLlm(question, rulesAnswer.intent)) {
      const llmAnswer = await answerWithLlm(question, history);
      if (llmAnswer) {
        return NextResponse.json({
          question: question.trim(),
          answer: { ...llmAnswer, source: "llm" as const },
          llm: llmStatus,
        });
      }
    }

    // Узкие вопросы с таблицами — SQL-правила.
    if (rulesAnswer.intent !== "unknown" && rulesAnswer.intent !== "help") {
      return NextResponse.json({
        question: question.trim(),
        answer: rulesAnswer,
        llm: llmStatus,
      });
    }

    if (llmStatus.enabled) {
      const llmAnswer = await answerWithLlm(question, history);
      if (llmAnswer) {
        return NextResponse.json({
          question: question.trim(),
          answer: { ...llmAnswer, source: "llm" as const },
          llm: llmStatus,
        });
      }
    }

    if (rulesAnswer.intent === "unknown") {
      return NextResponse.json({
        question: question.trim(),
        answer: await answerLogicalFallback(question),
        llm: llmStatus,
      });
    }

    return NextResponse.json({
      question: question.trim(),
      answer: rulesAnswer,
      llm: llmStatus,
    });
  } catch (error) {
    console.error("ask failed", error);
    return NextResponse.json(
      { error: "Не удалось получить ответ из хранилища" },
      { status: 500 },
    );
  }
}
