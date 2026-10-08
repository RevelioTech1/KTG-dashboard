import { NextResponse } from "next/server";
import { warehouseExists } from "@/lib/db";
import { answerQuestion, getAskSuggestions } from "@/lib/ask";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ suggestions: getAskSuggestions() });
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
    const answer = answerQuestion(question);
    return NextResponse.json({ question: question.trim(), answer });
  } catch (error) {
    console.error("ask failed", error);
    return NextResponse.json(
      { error: "Не удалось получить ответ из хранилища" },
      { status: 500 },
    );
  }
}
