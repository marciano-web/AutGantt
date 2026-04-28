"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Gantt,
  Task,
  ViewMode,
  TitleColumn,
  DateStartColumn,
  DateEndColumn,
  type Column,
} from "@wamra/gantt-task-react";
import "@wamra/gantt-task-react/dist/style.css";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const COLUMNS: readonly Column[] = [
  { id: "title", Cell: TitleColumn, width: 280, title: "Etapa" },
  { id: "start", Cell: DateStartColumn, width: 130, title: "Início" },
  { id: "end", Cell: DateEndColumn, width: 130, title: "Fim" },
];

const DATE_FORMATS = {
  dateColumnFormat: "dd/MM/yyyy",
  dayBottomHeaderFormat: "dd",
  dayTopHeaderFormat: "MMMM yyyy",
  hourBottomHeaderFormat: "HH",
  monthBottomHeaderFormat: "MMM",
  monthTopHeaderFormat: "yyyy",
} as const;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moveStageDates } from "@/app/(app)/projects/actions";
import type { ProjectStage } from "@/lib/types";

type Row = ProjectStage & {
  projects: { nome: string } | null;
  profiles: { full_name: string } | null;
};

export function GlobalGanttClient({ stages }: { stages: Row[] }) {
  const [view, setView] = useState<ViewMode>(ViewMode.Week);

  const tasks: Task[] = useMemo(() => {
    const projects = new Map<string, Row[]>();
    for (const s of stages) {
      const k = s.project_id;
      if (!projects.has(k)) projects.set(k, []);
      projects.get(k)!.push(s);
    }
    const out: Task[] = [];
    for (const [pid, items] of projects) {
      const minStart = items.reduce(
        (a, s) => (s.start_date < a ? s.start_date : a),
        items[0].start_date,
      );
      const maxEnd = items.reduce(
        (a, s) => (s.end_date > a ? s.end_date : a),
        items[0].end_date,
      );
      out.push({
        id: `p-${pid}`,
        name: items[0].projects?.nome ?? "Projeto",
        start: new Date(minStart + "T00:00:00"),
        end: new Date(maxEnd + "T23:59:59"),
        progress: 0,
        type: "project",
        hideChildren: false,
      });
      for (const s of items) {
        out.push({
          id: s.id,
          name: `${s.ordem}. ${s.nome}${s.profiles?.full_name ? " — " + s.profiles.full_name : ""}`,
          start: new Date(s.start_date + "T00:00:00"),
          end: new Date(s.end_date + "T23:59:59"),
          progress: s.progresso ?? 0,
          type: "task",
          parent: `p-${pid}`,
          styles: {
            barBackgroundColor: barColor(s.status),
            barBackgroundSelectedColor: barColor(s.status),
            barProgressColor: progressColor(s.status),
            barProgressSelectedColor: progressColor(s.status),
          },
        });
      }
    }
    return out;
  }, [stages]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gantt Geral</h1>
        <p className="text-sm text-muted-foreground">
          Todas as etapas de todos os projetos. Arraste as barras para mover datas.
        </p>
      </div>
      <Card>
        <CardHeader>
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
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-background"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Sem etapas para exibir.
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Gantt
                tasks={tasks}
                viewMode={view}
                dateLocale={ptBR}
                dateFormats={DATE_FORMATS}
                columns={COLUMNS}
                distances={{
                  columnWidth:
                    view === ViewMode.Month
                      ? 80
                      : view === ViewMode.Week
                        ? 100
                        : 50,
                  rowHeight: 36,
                  titleCellWidth: 280,
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
          )}
        </CardContent>
      </Card>
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
