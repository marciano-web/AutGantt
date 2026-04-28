"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  createProject,
  rescheduleProjectByCapacity,
  type CapacityWarning,
} from "./actions";
import type { DemandType, Profile, StageTemplate } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type UserOpt = Pick<Profile, "id" | "full_name" | "email">;

export function NewProjectDialog({
  types,
  templates,
  users,
}: {
  types: DemandType[];
  templates: StageTemplate[];
  users: UserOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [demandTypeId, setDemandTypeId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [capacityPrompt, setCapacityPrompt] = useState<{
    projectId: string;
    warnings: CapacityWarning[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const myTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.demand_type_id === demandTypeId)
        .sort((a, b) => a.ordem - b.ordem),
    [templates, demandTypeId],
  );

  function pickType(id: string) {
    setDemandTypeId(id);
    const tplIds = templates
      .filter((t) => t.demand_type_id === id)
      .map((t) => t.id);
    setSelected(new Set(tplIds));
    setAssignees({});
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function setAssignee(templateId: string, userId: string) {
    setAssignees({ ...assignees, [templateId]: userId === "none" ? "" : userId });
  }

  function reset() {
    setDemandTypeId("");
    setSelected(new Set());
    setAssignees({});
  }

  async function handleSubmit(fd: FormData) {
    fd.set("demand_type_id", demandTypeId);
    fd.set("template_ids", Array.from(selected).join(","));
    fd.set("assignees", JSON.stringify(assignees));
    setSubmitting(true);
    const r = await createProject(fd);
    setSubmitting(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    if (r.warnings && r.warnings.length > 0) {
      setCapacityPrompt({ projectId: r.projectId, warnings: r.warnings });
      return;
    }
    setOpen(false);
    reset();
    router.push(`/projects/${r.projectId}`);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button disabled={types.length === 0}>
            <Plus className="h-4 w-4" />
            Novo projeto
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input name="nome" required />
            </div>
            <div className="grid gap-2">
              <Label>Cliente</Label>
              <Input name="cliente" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tipo de demanda</Label>
                <Select value={demandTypeId} onValueChange={pickType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha..." />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Data inicial</Label>
                <Input name="start_date" type="date" />
              </div>
            </div>

            {demandTypeId && (
              <div className="grid gap-2 border border-border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">
                    Etapas ({selected.size}/{myTemplates.length})
                  </Label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setSelected(new Set(myTemplates.map((t) => t.id)))
                      }
                    >
                      Todas
                    </button>
                    <span className="text-border">·</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSelected(new Set())}
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>
                {myTemplates.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    Esse tipo não tem etapas-padrão cadastradas.
                  </div>
                ) : (
                  <div className="grid gap-1 max-h-72 overflow-y-auto">
                    {myTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggle(t.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground w-6">
                          {t.ordem}
                        </span>
                        <span className="flex-1 truncate">{t.nome}</span>
                        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                          {Number(t.horas_default).toFixed(1)}h
                        </span>
                        <Select
                          value={assignees[t.id] || "none"}
                          onValueChange={(v) => setAssignee(t.id, v)}
                        >
                          <SelectTrigger className="h-7 w-44 text-xs">
                            <SelectValue placeholder="Sem responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— sem —</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name || u.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Etapas renumeradas 1..N e agendadas em sequência (8h/dia, dias
                  úteis). Se houver responsável com sobrecarga, o sistema
                  perguntará se quer redistribuir.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={!demandTypeId || submitting}>
                {submitting ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {capacityPrompt && (
        <CapacityPrompt
          projectId={capacityPrompt.projectId}
          warnings={capacityPrompt.warnings}
          onClose={() => {
            setCapacityPrompt(null);
            setOpen(false);
            reset();
            router.push(`/projects/${capacityPrompt.projectId}`);
          }}
        />
      )}
    </>
  );
}

function CapacityPrompt({
  projectId,
  warnings,
  onClose,
}: {
  projectId: string;
  warnings: CapacityWarning[];
  onClose: () => void;
}) {
  const [pending, setPending] = useState<"reschedule" | "keep" | null>(null);

  async function reschedule() {
    setPending("reschedule");
    const r = await rescheduleProjectByCapacity(projectId);
    setPending(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Etapas redistribuídas (sem sobreposição por usuário)");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warn" />
            Sobrecarga detectada
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm grid gap-3">
          <p>
            O projeto foi criado, mas alguns responsáveis ficarão com mais de
            100% da jornada em pelo menos um dia:
          </p>
          <div className="border border-border rounded-md max-h-60 overflow-auto">
            {warnings.map((w) => (
              <div key={w.user_id} className="border-b border-border last:border-0 p-3">
                <div className="font-medium text-sm">
                  {w.full_name}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {w.jornada}h/dia · {w.days.length} dia(s)
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                  {w.days.slice(0, 8).map((d) => (
                    <span
                      key={d.dia}
                      className="px-1.5 py-0.5 rounded bg-danger/10 text-danger tabular-nums"
                    >
                      {fmtDate(d.dia)} · {(d.pct * 100).toFixed(0)}%
                    </span>
                  ))}
                  {w.days.length > 8 && (
                    <span className="text-muted-foreground">
                      + {w.days.length - 8} dia(s)…
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Reprogramar</strong>: serializa as etapas atribuídas ao
            mesmo usuário (sem sobreposição). Diferentes usuários continuam
            podendo trabalhar em paralelo.
            <br />
            <strong>Manter</strong>: deixa as datas como estão (carga
            acumulada).
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending !== null}
          >
            Manter (acumular)
          </Button>
          <Button onClick={reschedule} disabled={pending !== null}>
            {pending === "reschedule" ? "Redistribuindo..." : "Reprogramar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
