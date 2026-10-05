import { AlertTriangle, Info } from "lucide-react";

export function DataQualityList({
  issues,
}: {
  issues: { severity: string; area: string; message: string }[];
}) {
  if (issues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Замечаний к качеству данных при загрузке не выявлено.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue, index) => {
        const isWarning = issue.severity === "warning";
        const Icon = isWarning ? AlertTriangle : Info;
        return (
          <li key={index} className="flex gap-3">
            <Icon
              className={`mt-0.5 size-4 shrink-0 ${
                isWarning ? "text-chart-2" : "text-muted-foreground"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{issue.area}</p>
              <p className="text-muted-foreground text-sm">{issue.message}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
