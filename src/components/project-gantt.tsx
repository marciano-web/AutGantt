"use client";
import { useMemo, useState } from "react";
import {
  Gantt,
  Task,
  ViewMode,
} from "@wamra/gantt-task-react";
import "@wamra/gantt-task-react/dist/style.css";
import { toast } from "sonner";
import type { ProjectStage } from "@/lib/types";
import { moveStageDates } from "@/app/(app)/projects/actions";

type StageInput = ProjectStage & {
  profiles?: { full_name: string } | null;
};

export default function ProjectGantt({ stages }: { stages: StageInput[] }) {
  const [view, setView] = useState<ViewMode>(ViewMode.Day);

  const tasks: Task[] = useMemo(
    () =>
      stages.map((s) => ({
        id: s.id,
        name: `${s.ordem}. ${s.nome}${s.profiles?.full_name ? " — " + s.profiles.full_name : ""}`,
        start: new Date(s.start_date + "T00:00:00"),
        end: new Date(s.end_date + "T23:59:59"),
        progress: s.progresso ?? 0,
        type: "task",
        styles: {
          barBackgroundColor: barColor(s.status),
          barBackgroundSelectedColor: barColor(s.status),
          barProgressColor: progressColor(s.status),
          barProgressSelectedColor: progressColor(s.status),
        },
      })),
    [stages],
  );

  if (tasks.length === 0)
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Sem etapas para exibir.
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        {(
          [
            ["Dia", ViewMode.Day],
            ["Semana", ViewMode.Week],
            ["Mês", ViewMode.Month],
          ] as const
        ).map(([label, v]) => (
          <button
            key={label}
            onClick={() => setView(v)}
            className={`text-xs px-3 py-1 rounded-md border ${
              view === v ? "bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="border border-border rounded-md overflow-hidden">
        <Gantt
          tasks={tasks}
          viewMode={view}
          distances={{
            columnWidth:
              view === ViewMode.Month ? 80 : view === ViewMode.Week ? 100 : 50,
            rowHeight: 40,
            titleCellWidth: 220,
          }}
          onDateChange={async (task) => {
            if (task.type !== "task") return;
            const t = task as Task;
            const start = t.start.toISOString().slice(0, 10);
            const end = t.end.toISOString().slice(0, 10);
            const r = await moveStageDates(t.id, start, end);
            if (r.error) toast.error(r.error);
          }}
        />
      </div>
    </div>
  );
}

function barColor(status: string) {
  switch (status) {
    case "concluido":
      return "#10b981";
    case "em_andamento":
      return "#3b82f6";
    case "cancelado":
      return "#9ca3af";
    default:
      return "#6366f1";
  }
}
function progressColor(status: string) {
  switch (status) {
    case "concluido":
      return "#059669";
    case "em_andamento":
      return "#1d4ed8";
    case "cancelado":
      return "#6b7280";
    default:
      return "#4338ca";
  }
}
