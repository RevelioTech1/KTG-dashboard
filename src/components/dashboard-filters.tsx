"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const ALL = "__all__";

type Options = { regions: string[]; positions: string[]; ibms: string[] };

export function DashboardFilters({ options }: { options: Options }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = (key: string) => searchParams.get(key) ?? ALL;
  const hasFilters = ["region", "position", "ibm"].some((k) => searchParams.get(k));

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/", { scroll: false }));
  }

  const selects: { key: string; label: string; items: string[] }[] = [
    { key: "region", label: "Все регионы", items: options.regions },
    { key: "position", label: "Все должности", items: options.positions },
    { key: "ibm", label: "Все руководители (IBM)", items: options.ibms },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={isPending ? "" : undefined}
    >
      {selects.map(({ key, label, items }) => (
        <Select key={key} value={current(key)} onValueChange={(v) => update(key, v)}>
          <SelectTrigger size="sm" className="bg-card w-[190px]">
            <SelectValue placeholder={label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{label}</SelectItem>
            {items.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasFilters ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => startTransition(() => router.push("/", { scroll: false }))}
        >
          <X className="size-4" />
          Сбросить
        </Button>
      ) : null}
    </div>
  );
}
