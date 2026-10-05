import { Database } from "lucide-react";

export function WarehouseMissing() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="bg-secondary text-secondary-foreground mb-5 flex size-12 items-center justify-center rounded-xl">
        <Database className="size-6" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Хранилище данных не собрано</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Дашборд читает файл <code className="font-mono">data/warehouse.db</code>, который
        собирается из Excel-источников в папке <code className="font-mono">uploads/</code>.
      </p>
      <pre className="bg-card mt-6 w-full overflow-x-auto rounded-lg border p-4 text-left text-sm">
        <code className="font-mono">npm run etl</code>
      </pre>
      <p className="text-muted-foreground mt-4 text-xs">
        Команда <code className="font-mono">npm run dev</code> запускает ETL автоматически
        перед стартом сервера.
      </p>
    </div>
  );
}
