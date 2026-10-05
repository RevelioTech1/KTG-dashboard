import type { ReactNode } from "react";

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card flex h-full flex-col rounded-xl border p-5 shadow-xs">
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
 * Вывод для руководителя. Ставится последним в блоке: `mt-auto` прижимает его
 * к низу карточки, чтобы в строке из блоков разной высоты выводы были на одной
 * линии, а внешний отступ задаётся padding-ом, чтобы не склеиться с графиком.
 */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto pt-4">
      <p className="bg-accent/60 text-accent-foreground rounded-lg px-3 py-2 text-sm">
        {children}
      </p>
    </div>
  );
}
