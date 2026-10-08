import { answerQuestion } from "../src/lib/ask";

const questions = [
  "У кого из сотрудников лучший KPI?",
  "выдай мне топ 5 регионов по среднему баллу",
  "Кто в аутсайдерах по KPI?",
  "Сколько сотрудников без премии?",
  "Кто ближе всего к порогу 100 баллов?",
  "Как штрафы влияют на премии?",
  "Где больше всего теряется полевое время?",
  "Какая средняя ставка премии?",
  "asdf qwerty",
];

async function main() {
  for (const q of questions) {
    const a = await answerQuestion(q);
    console.log("\nQ:", q);
    console.log("intent:", a.intent, "|", a.title);
    console.log(a.text.slice(0, 180) + (a.text.length > 180 ? "…" : ""));
    if (a.rows?.length) console.log("rows:", a.rows.length, "cols:", a.columns?.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
