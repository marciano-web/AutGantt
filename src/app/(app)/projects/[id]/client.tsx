"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { brl, fmtDate } from "@/lib/utils";
import {
  deleteProject,
  deleteStage,
  updateProject,
  upsertStage,
} from "../actions";
import type {
  Profile,
  Project,
  ProjectCostView,
  ProjectStage,
} from "@/lib/types";

const ProjectGantt = dynamic(() => import("@/components/project-gantt"), {
  ssr: false,
});

type StageWithProfile = ProjectStage & {
  profiles: { full_name: string } | null;
};
type ProjectWithType = Project & { demand_types: { nome: string } | null };

export function ProjectDetailClient({
  project,
  stages,
  profiles,
  cost,
}: {
  project: ProjectWithType;
  stages: StageWithProfile[];
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  cost: ProjectCostView | null;
}) {
  const totalH = stages.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );
  const totalCost = stages.reduce((a, s) => a + Number(s.custo_calc ?? 0), 0);
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
        <div className="flex gap-2">
          <EditProjectDialog project={project} />
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
        <Stat label="Horas / Custo" value={`${totalH.toFixed(1)} h · ${brl(totalCost)}`} />
      </div>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">Etapas</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
        </TabsList>

        <TabsContent value="stages">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">Etapas</CardTitle>
                <CardDescription>
                  Custo recalculado automaticamente. Acima da jornada ×
                  dias_úteis, vira hora extra do assignee.
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
                defaults={{ ordem: nextOrdem }}
              />
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Etapa</TH>
                    <TH>Responsável</TH>
                    <TH>Início</TH>
                    <TH>Fim</TH>
                    <TH className="text-right">Horas</TH>
                    <TH className="text-right">Progresso</TH>
                    <TH className="text-right">Custo</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {stages.length === 0 && (
                    <TR>
                      <TD colSpan={9} className="text-center py-8 text-muted-foreground">
                        Sem etapas. Crie tipos de demanda com etapas-padrão para gerar automaticamente.
                      </TD>
                    </TR>
                  )}
                  {stages.map((s) => (
                    <TR key={s.id}>
                      <TD className="w-12">{s.ordem}</TD>
                      <TD className="font-medium">{s.nome}</TD>
                      <TD>{s.profiles?.full_name ?? "—"}</TD>
                      <TD>{fmtDate(s.start_date)}</TD>
                      <TD>{fmtDate(s.end_date)}</TD>
                      <TD className="text-right">
                        {Number(s.horas_estimadas).toFixed(1)}
                      </TD>
                      <TD className="text-right">{s.progresso}%</TD>
                      <TD className="text-right font-medium">
                        {brl(s.custo_calc)}
                      </TD>
                      <TD className="text-right w-24">
                        <div className="flex justify-end gap-1">
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
                              const r = await deleteStage(project.id, s.id);
                              if (r.error) toast.error(r.error);
                              else toast.success("Etapa removida");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt">
          <Card>
            <CardContent className="pt-6">
              <ProjectGantt stages={stages} />
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
  defaults?: { ordem?: number };
}) {
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>(stage?.assignee_id ?? "");
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
            fd.set("assignee_id", assignee);
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
                defaultValue={stage?.start_date ?? ""}
                required
              />
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Fim</Label>
              <Input
                name="end_date"
                type="date"
                defaultValue={stage?.end_date ?? ""}
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
            <div className="grid gap-2 col-span-2">
              <Label>Horas reais</Label>
              <Input
                name="horas_realizadas"
                type="number"
                step="0.5"
                defaultValue={stage?.horas_realizadas ?? 0}
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Custo fixo (R$)</Label>
              <Input
                name="custo_fixo"
                type="number"
                step="0.01"
                defaultValue={stage?.custo_fixo ?? 0}
              />
            </div>
            <div className="grid gap-2 col-span-3">
              <Label>Responsável</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— sem —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStage["status"])}>
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
            <div className="grid gap-2 col-span-1">
              <Label>%</Label>
              <Input
                name="progresso"
                type="number"
                min={0}
                max={100}
                defaultValue={stage?.progresso ?? 0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
