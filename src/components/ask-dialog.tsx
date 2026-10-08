"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCircleQuestion, Send, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AskAnswer = {
  title: string;
  text: string;
  columns?: string[];
  rows?: { cells: string[] }[];
  suggestions?: string[];
  intent: string;
};

type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: AskAnswer }
  | { role: "error"; text: string };

const DEFAULT_SUGGESTIONS = [
  "У кого из сотрудников лучший KPI?",
  "Выдай топ-5 регионов по среднему баллу",
  "Сколько сотрудников без премии?",
  "Кто ближе всего к порогу 100 баллов?",
];

export function AskDialog() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/ask")
      .then((r) => r.json())
      .then((data: { suggestions?: string[] }) => {
        if (data.suggestions?.length) setSuggestions(data.suggestions);
      })
      .catch(() => {
        /* оставляем дефолтные подсказки */
      });
    // Фокус в поле ввода при открытии
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, isPending]);

  function ask(text: string) {
    const q = text.trim();
    if (!q || isPending) return;

    setItems((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        const data = (await res.json()) as {
          answer?: AskAnswer;
          error?: string;
        };
        if (!res.ok || !data.answer) {
          setItems((prev) => [
            ...prev,
            { role: "error", text: data.error ?? "Не удалось получить ответ" },
          ]);
          return;
        }
        setItems((prev) => [...prev, { role: "assistant", answer: data.answer! }]);
        if (data.answer.suggestions?.length) {
          setSuggestions(data.answer.suggestions);
        }
      } catch {
        setItems((prev) => [
          ...prev,
          { role: "error", text: "Сеть недоступна. Проверьте, что сервер запущен." },
        ]);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="fixed right-4 bottom-4 z-50 h-12 gap-2 rounded-full px-5 shadow-lg sm:right-6 sm:bottom-6"
        >
          <MessageCircleQuestion className="size-5" />
          <span className="hidden sm:inline">Спросить данные</span>
          <span className="sm:hidden">Спросить</span>
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[min(720px,85vh)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            Вопросы по данным
          </DialogTitle>
          <DialogDescription>
            Ответы строятся из хранилища KPI и календаря — без выдуманных цифр.
            ФИО в источнике нет, сотрудники указаны по коду территории.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-5">
          <div className="flex flex-col gap-4 py-4">
            {items.length === 0 ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  Например, спросите:
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 6).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="bg-secondary text-secondary-foreground hover:bg-accent rounded-full px-3 py-1.5 text-left text-xs transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {items.map((item, index) => {
              if (item.role === "user") {
                return (
                  <div key={index} className="flex justify-end">
                    <div className="bg-primary text-primary-foreground max-w-[90%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm">
                      {item.text}
                    </div>
                  </div>
                );
              }
              if (item.role === "error") {
                return (
                  <div
                    key={index}
                    className="border-destructive/30 bg-destructive/5 text-destructive max-w-[95%] rounded-2xl rounded-bl-md border px-3.5 py-2 text-sm"
                  >
                    {item.text}
                  </div>
                );
              }
              return <AnswerBubble key={index} answer={item.answer} onSuggest={ask} />;
            })}

            {isPending ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span className="bg-muted-foreground/40 size-1.5 animate-pulse rounded-full" />
                Считаю по данным хранилища…
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t px-4 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="У кого лучший KPI? Топ-5 регионов…"
              rows={2}
              className="min-h-[44px] resize-none"
              disabled={isPending}
            />
            <Button
              size="icon"
              className="size-10 shrink-0"
              onClick={() => ask(question)}
              disabled={isPending || !question.trim()}
              aria-label="Отправить вопрос"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground mt-1.5 text-[11px]">
            Enter — отправить, Shift+Enter — новая строка
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnswerBubble({
  answer,
  onSuggest,
}: {
  answer: AskAnswer;
  onSuggest: (q: string) => void;
}) {
  return (
    <div className="bg-card max-w-[95%] space-y-3 rounded-2xl rounded-bl-md border px-3.5 py-3 text-sm shadow-xs">
      <p className="font-medium">{answer.title}</p>
      <p className="text-muted-foreground leading-relaxed">{answer.text}</p>

      {answer.columns && answer.rows && answer.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {answer.columns.map((col) => (
                  <TableHead key={col} className="h-8 px-2 text-xs">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {answer.rows.map((row, i) => (
                <TableRow key={i}>
                  {row.cells.map((cell, j) => (
                    <TableCell
                      key={j}
                      className={cn(
                        "px-2 py-1.5 text-xs",
                        j > 0 && "tabular-nums",
                      )}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {answer.suggestions?.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {answer.suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggest(s)}
              className="bg-secondary text-secondary-foreground hover:bg-accent rounded-full px-2.5 py-1 text-[11px] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
