"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gantt,
  Task,
  ViewMode,
  type Column,
  type ColumnProps,
  type DateSetup,
} from "@wamra/gantt-task-react";
import "@wamra/gantt-task-react/dist/style.css";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProjectStage, StageRealView, TimeEntry } from "@/lib/types";
import {
  deleteStage,
  finalizeStage,
  moveStageDates,
  moveStageDatesCascade,
  recalcStageDatesFromHoras,
  reopenStage,
  startTimer,
  stopTimer,
} from "@/app/(app)/projects/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusPill, deriveStageStatus } from "@/lib/stage-status";
import { brl, fmtDuration } from "@/lib/utils";
import { isBusinessDay } from "@/lib/holidays";
import { CascadeDialog, type CascadePromptArgs } from "@/components/cascade-dialog";

const HOURS_PER_DAY = 8;

function daysForHoras(horas: number): number {
  return Math.max(1, Math.ceil(Number(horas) / HOURS_PER_DAY));
}

// Avanca `count` dias uteis a partir de `start` (inclusive: count=1 = mesmo dia
// se util, senao proximo util). Respeita feriados via isBusinessDay.
function addBusinessDays(start: Date, count: number): Date {
  const r = new Date(start);
  while (!isBusinessDay(r)) r.setDate(r.getDate() + 1);
  let added = 1;
  while (added < count) {
    r.setDate(r.getDate() + 1);
    if (isBusinessDay(r)) added++;
  }
  return r;
}

function subBusinessDays(end: Date, count: number): Date {
  const r = new Date(end);
  while (!isBusinessDay(r)) r.setDate(r.getDate() - 1);
  let subtracted = 1;
  while (subtracted < count) {
    r.setDate(r.getDate() - 1);
    if (isBusinessDay(r)) subtracted++;
  }
  return r;
}

type StageInput = ProjectStage & {
  profiles?: { full_name: string } | null;
  projects?: { nome: string } | null;
};

type Ctx = {
  projectId: string;
  meId: string;
  stagesById: Map<string, StageInput>;
  realByStage: Map<string, StageRealView>;
  runningByStage: Map<string, TimeEntry>;
  requestDateChange: (args: CascadePromptArgs) => void;
};

const GanttCtx = createContext<Ctx | null>(null);

const DATE_FORMATS = {
  dateColumnFormat: "dd/MM/yyyy",
  dayBottomHeaderFormat: "dd",
  dayTopHeaderFormat: "dd",
  hourBottomHeaderFormat: "HH",
  monthBottomHeaderFormat: "MMM",
  // Em Day view, o top header usa monthTopHeaderFormat (capitalizado pelo CSS)
  monthTopHeaderFormat: "MMMM yyyy",
} as const;

// Em Week view, o wamra constroi o top header concatenando "<MonthText>, <Year>".
// Como nosso monthTopHeaderFormat ja inclui yyyy, isso duplica o ano
// (ex: "junho 2026, 2026"). Sobrescrevemos renderTopHeader pra cortar a duplicidade
// sem afetar Day/Month views.
function renderTopHeader(
  date: Date,
  viewMode: ViewMode,
  dateSetup: DateSetup,
) {
  if (viewMode === ViewMode.Week) {
    // Override pra evitar duplicidade do ano (default do wamra concatena
    // ", yyyy" no final do nosso monthTopHeaderFormat que ja inclui yyyy)
    return format(date, "MMMM yyyy", { locale: dateSetup.dateLocale });
  }
  // Demais views: comportamento padrao (usa monthTopHeaderFormat etc)
  switch (viewMode) {
    case ViewMode.Year:
      return date.getFullYear().toString();
    case ViewMode.Month:
      return date.getFullYear().toString();
    case ViewMode.Day:
    case ViewMode.TwoDays:
      return format(date, dateSetup.dateFormats.monthTopHeaderFormat, {
        locale: dateSetup.dateLocale,
      });
    default:
      return format(date, dateSetup.dateFormats.monthTopHeaderFormat, {
        locale: dateSetup.dateLocale,
      });
  }
}

// Tinge a 1ª coluna de cada mês para destacar a transição (em qualquer view)
function checkIsMonthStart(date: Date) {
  return date.getDate() === 1;
}

function isoFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function TitleCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage) {
    // linha de projeto (parent)
    return (
      <div className="px-2 py-1 font-semibold text-sm truncate">
        {(data.task as Task).name}
      </div>
    );
  }
  return (
    <div className="px-2 py-1 truncate">
      <div className="font-medium text-xs truncate">
        {stage.ordem}. {stage.nome}
      </div>
      {stage.profiles?.full_name && (
        <div className="text-[10px] text-muted-foreground truncate">
          {stage.profiles.full_name}
        </div>
      )}
    </div>
  );
}

function StartReadCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage) return null;
  return (
    <div className="px-2 text-xs tabular-nums">
      {new Date(stage.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
    </div>
  );
}

function EndReadCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage) return null;
  return (
    <div className="px-2 text-xs tabular-nums">
      {new Date(stage.end_date + "T00:00:00").toLocaleDateString("pt-BR")}
    </div>
  );
}

function StartCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage || !ctx) return null;
  return (
    <input
      key={`s:${stage.start_date}`}
      type="date"
      defaultValue={stage.start_date}
      className="w-[120px] text-xs h-7 rounded border border-input bg-background px-2"
      onChange={(e) => {
        const newStart = e.target.value;
        if (!newStart || newStart === stage.start_date) return;
        // Recalcula Fim baseado nas horas estimadas (mantem duracao)
        const horas = Number(stage.horas_estimadas ?? 0);
        const days = daysForHoras(horas);
        const startDate = new Date(newStart + "T00:00:00");
        const endDate = addBusinessDays(startDate, days);
        const newEnd = isoFromDate(endDate);
        ctx.requestDateChange({
          stageId: stage.id,
          oldStart: stage.start_date,
          oldEnd: stage.end_date,
          newStart,
          newEnd,
          horasEstimadas: horas,
        });
      }}
    />
  );
}

function EndCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage || !ctx) return null;
  return (
    <input
      key={`e:${stage.end_date}`}
      type="date"
      defaultValue={stage.end_date}
      className="w-[120px] text-xs h-7 rounded border border-input bg-background px-2"
      onChange={(e) => {
        const newEnd = e.target.value;
        if (!newEnd || newEnd === stage.end_date) return;
        // Recalcula Inicio baseado nas horas (manten duracao consistente)
        const horas = Number(stage.horas_estimadas ?? 0);
        const days = daysForHoras(horas);
        const endDate = new Date(newEnd + "T00:00:00");
        const startDate = subBusinessDays(endDate, days);
        const newStart = isoFromDate(startDate);
        ctx.requestDateChange({
          stageId: stage.id,
          oldStart: stage.start_date,
          oldEnd: stage.end_date,
          newStart,
          newEnd,
          horasEstimadas: horas,
        });
      }}
    />
  );
}

function HorasCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const router = useRouter();
  const stage = ctx?.stagesById.get(data.task.id);
  const [pending, setPending] = useState(false);
  if (!stage || !ctx) return null;
  const current = Number(stage.horas_estimadas ?? 0);
  return (
    <input
      key={`h:${current}`}
      type="number"
      step={0.5}
      min={0}
      disabled={pending}
      defaultValue={current}
      className="w-[70px] text-xs h-7 rounded border border-input bg-background px-2 tabular-nums"
      onBlur={async (e) => {
        const newHoras = Number(e.target.value);
        if (Number.isNaN(newHoras) || newHoras < 0) {
          e.target.value = String(current);
          return;
        }
        if (newHoras === current) return;
        // Mantem Inicio, recalcula Fim baseado nas novas horas. Salva direto
        // sem cascade dialog (mudanca de horas e local, nao afeta sequencia).
        const days = daysForHoras(newHoras);
        const startDate = new Date(stage.start_date + "T00:00:00");
        const endDate = addBusinessDays(startDate, days);
        const newEnd = isoFromDate(endDate);
        setPending(true);
        const r = await moveStageDatesCascade(
          stage.id,
          stage.start_date,
          newEnd,
          "self",
          newHoras,
        );
        setPending(false);
        if (r.error) {
          toast.error(r.error);
          e.target.value = String(current);
        } else {
          toast.success("Horas atualizadas");
          router.refresh();
        }
      }}
    />
  );
}

function HorasReadCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage) return null;
  return (
    <div className="px-2 text-xs tabular-nums">
      {Number(stage.horas_estimadas ?? 0).toFixed(1)}h
    </div>
  );
}

function StatusCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage) return null;
  const real = ctx?.realByStage.get(stage.id);
  const status = deriveStageStatus(stage, Number(real?.horas_reais ?? 0) > 0);
  return (
    <div className="px-2">
      <StatusPill status={status} />
    </div>
  );
}

function TimerCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const router = useRouter();
  const stage = ctx?.stagesById.get(data.task.id);
  const real = ctx?.realByStage.get(data.task.id);
  const running = ctx?.runningByStage.get(data.task.id);
  const isAssignee = !!stage && stage.assignee_id === ctx?.meId;
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!stage) return null;
  const baseSec = Math.max(
    0,
    Math.round(
      Number(real?.horas_reais ?? 0) * 3600 -
        (running ? (Date.now() - new Date(running.started_at).getTime()) / 1000 : 0),
    ),
  );
  const liveSec = running
    ? baseSec + Math.floor((now - new Date(running.started_at).getTime()) / 1000)
    : baseSec;

  async function toggle() {
    if (!isAssignee || !stage) return;
    setPending(true);
    const r = running ? await stopTimer(stage.id) : await startTimer(stage.id);
    setPending(false);
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-1 px-2">
      <span
        className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded font-medium ${
          running
            ? "bg-success/10 text-success animate-pulse"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {fmtDuration(liveSec)}
      </span>
      {isAssignee && (
        <button
          onClick={toggle}
          disabled={pending}
          title={running ? "Parar" : "Iniciar"}
          className={`h-6 w-6 rounded inline-flex items-center justify-center ${
            running
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

function CostCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const stage = ctx?.stagesById.get(data.task.id);
  // linha de projeto: soma dos filhos
  if (!stage) {
    if (!ctx) return null;
    const projectId = String(data.task.id).replace(/^p-/, "");
    let total = 0;
    for (const s of ctx.stagesById.values()) {
      if (s.project_id === projectId)
        total += Number(ctx.realByStage.get(s.id)?.custo_real ?? 0);
    }
    return (
      <div className="px-2 text-right text-xs tabular-nums w-full font-semibold">
        {brl(total)}
      </div>
    );
  }
  const real = ctx?.realByStage.get(data.task.id);
  return (
    <div className="px-2 text-right text-xs tabular-nums w-full">
      {brl(Number(real?.custo_real ?? 0))}
    </div>
  );
}

function ActionsCell({ data }: ColumnProps) {
  const ctx = useContext(GanttCtx);
  const router = useRouter();
  const stage = ctx?.stagesById.get(data.task.id);
  if (!stage || !ctx) return null;
  const isDone =
    stage.status === "concluido" || stage.status === "cancelado";
  return (
    <div className="flex gap-1 px-2">
      {!isDone ? (
        <button
          title="Finalizar etapa"
          className="h-6 w-6 rounded inline-flex items-center justify-center hover:bg-success/10 text-success"
          onClick={async () => {
            if (!confirm("Finalizar essa etapa?")) return;
            const r = await finalizeStage(stage.id, ctx.projectId);
            if (r.error) toast.error(r.error);
            else {
              toast.success("Etapa finalizada");
              router.refresh();
            }
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          title="Reabrir etapa"
          className="h-6 w-6 rounded inline-flex items-center justify-center hover:bg-muted text-muted-foreground"
          onClick={async () => {
            const r = await reopenStage(stage.id, ctx.projectId);
            if (r.error) toast.error(r.error);
            else {
              toast.success("Etapa reaberta");
              router.refresh();
            }
          }}
        >
          ↺
        </button>
      )}
      {!isDone && (
        <RecalcButton stageId={stage.id} stageName={stage.nome} />
      )}
      <button
        title="Excluir etapa"
        className="h-6 w-6 rounded inline-flex items-center justify-center hover:bg-destructive/10 text-destructive"
        onClick={async () => {
          if (!confirm("Excluir esta etapa? Apontamentos também serão removidos."))
            return;
          const r = await deleteStage(ctx.projectId, stage.id);
          if (r.error) toast.error(r.error);
          else {
            toast.success("Etapa removida");
            router.refresh();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function RecalcButton({
  stageId,
  stageName,
}: {
  stageId: string;
  stageName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"self" | "project" | null>(null);

  async function apply(mode: "self" | "project") {
    setPending(mode);
    const r = await recalcStageDatesFromHoras(stageId, mode);
    setPending(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    if (mode === "self") toast.success("Etapa recalculada");
    else toast.success(`${r.updated ?? 0} etapa(s) recalculada(s)`);
    router.refresh();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <button
          title="Recalcular datas pelas horas estimadas"
          className="h-6 w-6 rounded inline-flex items-center justify-center hover:bg-primary/10 text-primary"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recalcular datas pelas horas</DialogTitle>
          <DialogDescription>
            Fim recalculado a partir do Início, usando 8h/dia útil (feriados
            BR respeitados). Etapas concluídas/canceladas são preservadas.
          </DialogDescription>
        </DialogHeader>
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          Etapa: <span className="font-medium text-foreground">{stageName}</span>
        </div>
        <div className="grid gap-2">
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => apply("self")}
            className="justify-start h-auto py-3"
          >
            <div className="text-left">
              <div className="font-medium">Apenas esta etapa</div>
              <div className="text-xs text-muted-foreground font-normal">
                Mantém o Início, recalcula só o Fim baseado nas horas.
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => apply("project")}
            className="justify-start h-auto py-3"
          >
            <div className="text-left">
              <div className="font-medium">
                Esta etapa + as seguintes deste projeto
              </div>
              <div className="text-xs text-muted-foreground font-normal">
                Encadeia: cada etapa seguinte começa no próximo dia útil
                após o Fim da anterior.
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const INTERACTIVE_COLUMNS: readonly Column[] = [
  { id: "title", Cell: TitleCell, width: 220, title: "Etapa" },
  { id: "start", Cell: StartCell, width: 130, title: "Início" },
  { id: "end", Cell: EndCell, width: 130, title: "Fim" },
  { id: "horas", Cell: HorasCell, width: 90, title: "Horas est." },
  { id: "status", Cell: StatusCell, width: 130, title: "Status" },
  { id: "timer", Cell: TimerCell, width: 130, title: "Timer" },
  { id: "cost", Cell: CostCell, width: 100, title: "Custo" },
  { id: "actions", Cell: ActionsCell, width: 80, title: "" },
];

const READONLY_COLUMNS: readonly Column[] = [
  { id: "title", Cell: TitleCell, width: 180, title: "Etapa" },
  { id: "start", Cell: StartReadCell, width: 80, title: "Início" },
  { id: "end", Cell: EndReadCell, width: 80, title: "Fim" },
  { id: "horas", Cell: HorasReadCell, width: 70, title: "Horas est." },
  { id: "status", Cell: StatusCell, width: 100, title: "Status" },
];

export default function ProjectGantt({
  stages,
  real = [],
  entries = [],
  meId = "",
  projectId,
  readOnly = false,
  groupByProject = false,
}: {
  stages: StageInput[];
  real?: StageRealView[];
  entries?: TimeEntry[];
  meId?: string;
  projectId?: string;
  readOnly?: boolean;
  groupByProject?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>(
    readOnly ? ViewMode.Week : ViewMode.Day,
  );
  const [cascadeArgs, setCascadeArgs] = useState<CascadePromptArgs | null>(null);

  const ctx: Ctx = useMemo(
    () => ({
      projectId: projectId ?? stages[0]?.project_id ?? "",
      meId,
      stagesById: new Map(stages.map((s) => [s.id, s])),
      realByStage: new Map(real.map((r) => [r.stage_id, r])),
      runningByStage: (() => {
        const m = new Map<string, TimeEntry>();
        for (const e of entries)
          if (e.ended_at === null && e.user_id === meId) m.set(e.stage_id, e);
        return m;
      })(),
      requestDateChange: (args) => setCascadeArgs(args),
    }),
    [stages, real, entries, meId, projectId],
  );

  const tasks: Task[] = useMemo(() => {
    if (!groupByProject) {
      return stages.map((s) => ({
        id: s.id,
        name: `${s.ordem}. ${s.nome}`,
        start: new Date(s.start_date + "T00:00:00"),
        end: new Date(s.end_date + "T23:59:59"),
        progress: s.progresso ?? 0,
        type: "task",
        styles: {
          barBackgroundColor: barColor(s.status),
          barBackgroundSelectedColor: barColor(s.status),
          barProgressColor: progressColor(s.status),
          barProgressSelectedColor: progressColor(s.status),
          barLabelColor: "transparent",
          barLabelWhenOutsideColor: "transparent",
        },
      }));
    }
    // agrupado: 1 linha "project" por projeto + filhos
    const byProject = new Map<string, StageInput[]>();
    for (const s of stages) {
      if (!byProject.has(s.project_id)) byProject.set(s.project_id, []);
      byProject.get(s.project_id)!.push(s);
    }
    // Ordena etapas DENTRO do projeto pela sequencia logica (ordem), nao por
    // start_date — assim 1, 2, 3, 4... aparecem na ordem certa mesmo quando
    // alguma foi reagendada e cronologicamente esta fora.
    // Desempate por start_date pra ficar estavel.
    for (const items of byProject.values()) {
      items.sort(
        (a, b) =>
          a.ordem - b.ordem || a.start_date.localeCompare(b.start_date),
      );
    }
    const out: Task[] = [];
    for (const [pid, items] of byProject) {
      let minStart = items[0].start_date;
      let maxEnd = items[0].end_date;
      for (const s of items) {
        if (s.start_date < minStart) minStart = s.start_date;
        if (s.end_date > maxEnd) maxEnd = s.end_date;
      }
      const projectName = items[0].projects?.nome ?? "Projeto";
      out.push({
        id: `p-${pid}`,
        name: projectName,
        start: new Date(minStart + "T00:00:00"),
        end: new Date(maxEnd + "T23:59:59"),
        progress: 0,
        type: "project",
        hideChildren: false,
      });
      for (const s of items) {
        out.push({
          id: s.id,
          name: `${s.ordem}. ${s.nome}`,
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
            barLabelColor: "transparent",
            barLabelWhenOutsideColor: "transparent",
          },
        });
      }
    }
    return out;
  }, [stages, groupByProject]);

  // IMPORTANTE: todos os hooks DEVEM ser chamados antes de qualquer early return,
  // senao a contagem de hooks varia entre renders (ex: filtro de data zera tasks)
  // e o React quebra com "Rendered fewer hooks than expected".
  const stagesKey = useMemo(
    () =>
      stages
        .map((s) => `${s.id}:${s.start_date}:${s.end_date}:${s.assignee_id ?? "_"}`)
        .join("|"),
    [stages],
  );

  if (tasks.length === 0)
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Sem etapas para exibir.
      </div>
    );

  const colWidth = readOnly
    ? view === ViewMode.Month
      ? 50
      : view === ViewMode.Week
        ? 50
        : 22
    : view === ViewMode.Month
      ? 80
      : view === ViewMode.Week
        ? 100
        : 50;

  return (
    <GanttCtx.Provider value={ctx}>
      <CascadeDialog
        open={!!cascadeArgs}
        args={cascadeArgs}
        onClose={() => setCascadeArgs(null)}
      />
      <div className="grid gap-3">
        <div className="flex gap-2 print:hidden">
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
        <div className="border border-border rounded-md overflow-hidden gantt-print-fit">
          <Gantt
            key={stagesKey}
            tasks={tasks}
            viewMode={view}
            dateLocale={ptBR}
            dateFormats={DATE_FORMATS}
            renderTopHeader={renderTopHeader}
            checkIsHoliday={checkIsMonthStart}
            colors={{
              holidayBackgroundColor: "rgba(99, 102, 241, 0.18)",
            }}
            columns={readOnly ? READONLY_COLUMNS : INTERACTIVE_COLUMNS}
            distances={{
              columnWidth: colWidth,
              rowHeight: readOnly ? 32 : 44,
              titleCellWidth: readOnly ? 180 : 220,
            }}
            onDateChange={
              readOnly
                ? undefined
                : async (task) => {
                    if (task.type !== "task") return;
                    const t = task as Task;
                    const start = isoFromDate(t.start);
                    const end = isoFromDate(t.end);
                    const r = await moveStageDates(t.id, start, end);
                    if (r.error) toast.error(r.error);
                    else router.refresh();
                  }
            }
          />
        </div>
      </div>
    </GanttCtx.Provider>
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
