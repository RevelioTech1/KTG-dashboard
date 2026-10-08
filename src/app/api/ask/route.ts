import { NextResponse } from "next/server";
import { warehouseExists } from "@/lib/db";
import {
  answerLogicalFallback,
  answerQuestion,
  getAskSuggestions,
} from "@/lib/ask";
import { answerWithLlm, getLlmStatus } from "@/lib/ask-llm";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    suggestions: getAskSuggestions(),
    llm: getLlmStatus(),
  });
}

export async function POST(request: Request) {
  if (!warehouseExists()) {
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
    const llmStatus = getLlmStatus();
    const rulesAnswer = answerQuestion(question);

    // Узкие вопросы с таблицами — сразу из SQL.
    if (rulesAnswer.intent !== "unknown" && rulesAnswer.intent !== "help") {
      return NextResponse.json({
        question: question.trim(),
        answer: rulesAnswer,
        llm: llmStatus,
      });
    }

    // Свободная формулировка — нейросеть с контекстом хранилища.
    if (llmStatus.enabled) {
      const llmAnswer = await answerWithLlm(question);
      if (llmAnswer) {
        return NextResponse.json({
          question: question.trim(),
          answer: { ...llmAnswer, source: "llm" as const },
          llm: llmStatus,
        });
      }
    }

    // Нет ключа / сбой LLM — логический вывод по сводке и зоне порога.
    if (rulesAnswer.intent === "unknown") {
      return NextResponse.json({
        question: question.trim(),
        answer: answerLogicalFallback(question),
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
