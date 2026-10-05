"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="bg-destructive/10 text-destructive mb-5 flex size-12 items-center justify-center rounded-xl">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Не удалось построить дашборд</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {error.message || "Неизвестная ошибка при чтении хранилища данных."}
      </p>
      <p className="text-muted-foreground mt-4 text-xs">
        Если хранилище повреждено, пересоберите его командой{" "}
        <code className="font-mono">npm run etl</code>.
      </p>
      <Button className="mt-6" onClick={reset}>
        Попробовать снова
      </Button>
    </div>
  );
}
