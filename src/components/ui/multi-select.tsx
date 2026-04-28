"use client";
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  values: Set<string>;
  onChange: (next: Set<string>) => void;
  className?: string;
}) {
  function toggle(v: string) {
    const next = new Set(values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  }
  function selectAll() {
    onChange(new Set(options.map((o) => o.value)));
  }
  function clearAll() {
    onChange(new Set());
  }
  const selectedLabel =
    values.size === 0
      ? "Nenhum"
      : values.size === options.length
        ? "Todos"
        : `${values.size} selecionado${values.size > 1 ? "s" : ""}`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent",
          className,
        )}
      >
        <span className="truncate">
          <span className="text-muted-foreground">{label}:</span>{" "}
          <span className="font-medium">{selectedLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-80 overflow-auto rounded-md border border-border bg-background shadow-md min-w-[220px]"
        >
          <div className="flex border-b border-border text-xs">
            <button
              onClick={selectAll}
              className="flex-1 px-3 py-1.5 hover:bg-accent"
            >
              Todos
            </button>
            <button
              onClick={clearAll}
              className="flex-1 px-3 py-1.5 hover:bg-accent border-l border-border"
            >
              Nenhum
            </button>
          </div>
          {options.map((opt) => {
            const checked = values.has(opt.value);
            return (
              <DropdownMenu.Item
                key={opt.value}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(opt.value);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
              >
                <span
                  className={cn(
                    "h-4 w-4 inline-flex items-center justify-center rounded border",
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{opt.label}</span>
              </DropdownMenu.Item>
            );
          })}
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Sem opções
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
