import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "warn" | "bad";

const toneStyles: Record<Tone, string> = {
  neutral: "text-foreground",
  good: "text-chart-5",
  warn: "text-chart-2",
  bad: "text-destructive",
};

export function KpiCard({
  label,
  value,
  unit,
  tone = "neutral",
  context,
  footnote,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  context?: string;
  footnote?: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-5 shadow-xs">
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-semibold tracking-tight", toneStyles[tone])}>
          {value}
        </span>
        {unit ? <span className="text-muted-foreground text-sm">{unit}</span> : null}
      </p>
      {context ? <p className="text-sm">{context}</p> : null}
      {footnote ? <p className="text-muted-foreground mt-auto text-xs">{footnote}</p> : null}
    </div>
  );
}
