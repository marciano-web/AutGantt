"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, fmtDate, fmtDuration } from "@/lib/utils";
import { StageTimer } from "@/components/stage-timer";
import { PrintButton } from "@/components/print-button";
import {
  deleteProject,
  deleteStage,
  deleteTimeEntry,
  finalizeProject,
  finalizeStage,
  reopenStage,
  updateProject,
  upsertStage,
} from "../actions";
import { StatusPill, deriveStageStatus } from "@/lib/stage-status";
import type {
  Profile,
  Project,
  ProjectCostView,
  ProjectStage,
  StageRealView,
  TimeEntry,
} from "@/lib/types";

const ProjectGantt = dynamic(() => import("@/components/project-gantt"), {
  ssr: false,
});

type StageWithProfile = ProjectStage & {
  profiles: { full_name: string } | null;
};
type ProjectWithType = Project & { demand_types: { nome: string } | null };
type TimeEntryRow = TimeEntry & { profiles: { full_name: string } | null };

export function ProjectDetailClient({
  project,
  stages,
  profiles,
  cost,
  real,
  entries,
  meId,
}: {
  project: ProjectWithType;
  stages: StageWithProfile[];
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  cost: ProjectCostView | null;
  real: StageRealView[];
  entries: TimeEntryRow[];
  meId: string;
}) {
  const realByStage = useMemo(
    () => new Map(real.map((r) => [r.stage_id, r])),
    [real],
  );
  const runningByStage = useMemo(() => {
    const m = new Map<string, TimeEntryRow>();
    for (const e of entries)
      if (e.ended_at === null && e.user_id === meId) m.set(e.stage_id, e);
    return m;
  }, [entries, meId]);

  const totalH = real.reduce((a, r) => a + Number(r.horas_reais ?? 0), 0);
  const totalCost = real.reduce((a, r) => a + Number(r.custo_real ?? 0), 0);
  const totalEst = stages.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );
  const nextOrdem = (stages.at(-1)?.ordem ?? 0) + 1;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.nome}
          </h1>
          <p className="text-sm text-muted-foreground">
            {project.demand_types?.nome ?? "—"}
            {project.cliente ? ` · ${project.cliente}` : ""}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <EditProjectDialog project={project} />
          {project.status !== "concluido" && project.status !== "cancelado" && (
            <Button
              variant="default"
              onClick={async () => {
                if (
                  !confirm(
                    "Finalizar este projeto? Todas as etapas em aberto serão marcadas como concluídas e timers em execução serão parados.",
                  )
                )
                  return;
                const r = await finalizeProject(project.id);
                if (r.error) toast.error(r.error);
                else toast.success("Projeto finalizado");
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar projeto
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm("Excluir este projeto e todas as etapas?")) return;
              await deleteProject(project.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Status" value={project.status.replace("_", " ")} />
        <Stat label="Início" value={fmtDate(project.start_date)} />
        <Stat label="Fim" value={fmtDate(project.end_date)} />
        <Stat
          label="Horas reais · estimadas"
          value={`${totalH.toFixed(1)}h · ${totalEst.toFixed(1)}h`}
        />
        <Stat label="Custo real" value={brl(totalCost)} />
      </div>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">Etapas</TabsTrigger>
          <TabsTrigger value="timesheet">Apontamentos</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
        </TabsList>

        <TabsContent value="stages">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">Etapas</CardTitle>
                <CardDescription>
                  Custo real é calculado a partir do tempo logado pelo
                  responsável de cada apontamento (snapshot do custo/h no
                  momento do start).
                </CardDescription>
              </div>
              <StageDialog
                projectId={project.id}
                profiles={profiles}
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" />
                    Etapa
                  </Button>
                }
                defaults={{
                  ordem: nextOrdem,
                  start_date: project.start_date ?? "",
                  end_date: project.start_date ?? "",
                }}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Etapa</TH>
                    <TH>Responsável</TH>
                    <TH>Datas</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Horas est.</TH>
                    <TH>Timer</TH>
                    <TH className="text-right">Custo real</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {stages.length === 0 && (
                    <TR>
                      <TD
                        colSpan={9}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Sem etapas. Crie tipos de demanda com etapas-padrão
                        para gerar automaticamente.
                      </TD>
                    </TR>
                  )}
                  {stages.map((s) => {
                    const r = realByStage.get(s.id);
                    const isMe = s.assignee_id === meId;
                    const running = runningByStage.get(s.id);
                    const derived = deriveStageStatus(
                      s,
                      Number(r?.horas_reais ?? 0) > 0,
                    );
                    const isDone =
                      s.status === "concluido" || s.status === "cancelado";
                    return (
                      <TR key={s.id}>
                        <TD className="w-12">{s.ordem}</TD>
                        <TD className="font-medium">{s.nome}</TD>
                        <TD>{s.profiles?.full_name ?? "—"}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {fmtDate(s.start_date)} →{" "}
                          {fmtDate(s.end_date)}
                        </TD>
                        <TD>
                          <StatusPill status={derived} />
                        </TD>
                        <TD className="text-right">
                          {Number(s.horas_estimadas).toFixed(1)}
                        </TD>
                        <TD>
                          <StageTimer
                            stageId={s.id}
                            isAssignee={isMe}
                            runningStartedAt={running?.started_at ?? null}
                            baselineSeconds={Math.round(
                              Number(r?.horas_reais ?? 0) * 3600 -
                                (running
                                  ? (Date.now() -
                                      new Date(running.started_at).getTime()) /
                                    1000
                                  : 0),
                            )}
                          />
                        </TD>
                        <TD className="text-right font-medium">
                          {brl(r?.custo_real ?? 0)}
                        </TD>
                        <TD className="text-right w-32">
                          <div className="flex justify-end gap-1">
                            {!isDone ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Finalizar etapa"
                                onClick={async () => {
                                  if (!confirm("Finalizar essa etapa?")) return;
                                  const res = await finalizeStage(
                                    s.id,
                                    project.id,
                                  );
                                  if (res.error) toast.error(res.error);
                                  else toast.success("Etapa finalizada");
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Reabrir etapa"
                                onClick={async () => {
                                  const res = await reopenStage(
                                    s.id,
                                    project.id,
                                  );
                                  if (res.error) toast.error(res.error);
                                  else toast.success("Etapa reaberta");
                                }}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <StageDialog
                              projectId={project.id}
                              profiles={profiles}
                              stage={s}
                              trigger={
                                <Button size="icon" variant="ghost">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                if (!confirm("Excluir esta etapa?")) return;
                                const res = await deleteStage(project.id, s.id);
                                if (res.error) toast.error(res.error);
                                else toast.success("Etapa removida");
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheet">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apontamentos de tempo</CardTitle>
              <CardDescription>
                Histórico de start/stop. O custo é congelado no início de cada
                apontamento (snapshot do custo/h do usuário).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum apontamento ainda.
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Etapa</TH>
                      <TH>Usuário</TH>
                      <TH>Início</TH>
                      <TH>Fim</TH>
                      <TH className="text-right">Duração</TH>
                      <TH className="text-right">Custo/h</TH>
                      <TH className="text-right">Custo</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {entries.map((e) => {
                      const stage = stages.find((s) => s.id === e.stage_id);
                      const seconds = e.ended_at
                        ? (new Date(e.ended_at).getTime() -
                            new Date(e.started_at).getTime()) /
                          1000
                        : 0;
                      const cost = (seconds / 3600) * Number(e.hourly_rate);
                      return (
                        <TR key={e.id}>
                          <TD>{stage?.nome ?? "—"}</TD>
                          <TD>{e.profiles?.full_name ?? "—"}</TD>
                          <TD className="text-xs">
                            {new Date(e.started_at).toLocaleString("pt-BR")}
                          </TD>
                          <TD className="text-xs">
                            {e.ended_at
                              ? new Date(e.ended_at).toLocaleString("pt-BR")
                              : <span className="text-success">⏵ rodando</span>}
                          </TD>
                          <TD className="text-right tabular-nums">
                            {e.ended_at ? fmtDuration(seconds) : "—"}
                          </TD>
                          <TD className="text-right">{brl(e.hourly_rate)}</TD>
                          <TD className="text-right font-medium">
                            {e.ended_at ? brl(cost) : "—"}
                          </TD>
                          <TD className="text-right">
                            {e.user_id === meId && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={async () => {
                                  if (!confirm("Excluir esse apontamento?"))
                                    return;
                                  const r = await deleteTimeEntry(e.id);
                                  if (r.error) toast.error(r.error);
                                  else toast.success("Apontamento removido");
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt">
          <Card>
            <CardContent className="pt-6">
              <ProjectGantt
                stages={stages}
                real={real}
                entries={entries}
                meId={meId}
                projectId={project.id}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className="text-lg font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EditProjectDialog({ project }: { project: ProjectWithType }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(project.status);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar projeto</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("status", status);
            const r = await updateProject(project.id, fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Salvo");
            setOpen(false);
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input name="nome" defaultValue={project.nome} required />
          </div>
          <div className="grid gap-2">
            <Label>Cliente</Label>
            <Input name="cliente" defaultValue={project.cliente ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Project["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planejado">Planejado</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StageDialog({
  projectId,
  stage,
  profiles,
  trigger,
  defaults,
}: {
  projectId: string;
  stage?: StageWithProfile;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  trigger: React.ReactNode;
  defaults?: { ordem?: number; start_date?: string; end_date?: string };
}) {
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>(stage?.assignee_id ?? "none");
  const [status, setStatus] = useState<ProjectStage["status"]>(
    stage?.status ?? "planejado",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{stage ? "Editar etapa" : "Nova etapa"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            if (stage) fd.set("id", stage.id);
            fd.set("assignee_id", assignee === "none" ? "" : assignee);
            fd.set("status", status);
            const r = await upsertStage(projectId, fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Salvo");
            setOpen(false);
          }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-6 gap-3">
            <div className="grid gap-2 col-span-1">
              <Label>Ordem</Label>
              <Input
                name="ordem"
                type="number"
                defaultValue={stage?.ordem ?? defaults?.ordem ?? 1}
                required
              />
            </div>
            <div className="grid gap-2 col-span-5">
              <Label>Nome</Label>
              <Input name="nome" defaultValue={stage?.nome ?? ""} required />
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Início</Label>
              <Input
                name="start_date"
                type="date"
                defaultValue={stage?.start_date ?? defaults?.start_date ?? ""}
                required
              />
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Fim</Label>
              <Input
                name="end_date"
                type="date"
                defaultValue={stage?.end_date ?? defaults?.end_date ?? ""}
                required
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Horas est.</Label>
              <Input
                name="horas_estimadas"
                type="number"
                step="0.5"
                defaultValue={stage?.horas_estimadas ?? 0}
              />
            </div>
            <div className="grid gap-2 col-span-4">
              <Label>Responsável</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— sem —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProjectStage["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejado">Planejado</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Progresso (%)</Label>
              <Input
                name="progresso"
                type="number"
                min={0}
                max={100}
                defaultValue={stage?.progresso ?? 0}
              />
            </div>
          </div>
          {stage && (
            <p className="text-xs text-muted-foreground">
              <Clock className="inline h-3 w-3 mr-1" />
              Trocar o responsável <strong>não apaga</strong> os apontamentos do
              responsável anterior — eles continuam contando para o custo da
              etapa com a taxa daquele momento.
            </p>
          )}
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
