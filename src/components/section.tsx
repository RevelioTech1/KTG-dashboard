import type { ReactNode } from "react";

export function Section({
  title,
  description,
  action,
  children,
  /** Растянуть карточку на высоту строки grid (для парных блоков). */
  fill = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <section
      className={
        fill
          ? "bg-card flex h-full flex-col rounded-xl border p-5 shadow-xs"
          : "bg-card rounded-xl border p-5 shadow-xs"
      }
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Вывод для руководителя. Внешний отступ сверху, чтобы не склеиться с графиком.
 */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="bg-accent/60 text-accent-foreground rounded-lg px-3 py-2 text-sm">
        {children}
      </p>
    </div>
  );
}
