"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import type { DemandType, StageTemplate } from "@/lib/types";
import { createProject } from "./actions";

export function NewProjectDialog({
  types,
  templates,
}: {
  types: DemandType[];
  templates: StageTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [demandTypeId, setDemandTypeId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const myTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.demand_type_id === demandTypeId)
        .sort((a, b) => a.ordem - b.ordem),
    [templates, demandTypeId],
  );

  function pickType(id: string) {
    setDemandTypeId(id);
    // Por padrão marca todas as etapas do tipo escolhido
    const tplIds = templates
      .filter((t) => t.demand_type_id === id)
      .map((t) => t.id);
    setSelected(new Set(tplIds));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(myTemplates.map((t) => t.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setDemandTypeId("");
          setSelected(new Set());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={types.length === 0}>
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("demand_type_id", demandTypeId);
            fd.set("template_ids", Array.from(selected).join(","));
            try {
              const r = await createProject(fd);
              if (r && "error" in r) toast.error(r.error);
            } catch (e) {
              if (
                (e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT")
              )
                throw e;
              toast.error(String(e));
            }
          }}
          className="grid gap-4"
        >
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
                    onClick={selectAll}
                  >
                    Todas
                  </button>
                  <span className="text-border">·</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={clearAll}
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
                <div className="grid gap-1 max-h-60 overflow-y-auto">
                  {myTemplates.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-accent cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground w-6">
                        {t.ordem}
                      </span>
                      <span className="flex-1 truncate">{t.nome}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Number(t.horas_default).toFixed(1)}h
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Etapas renumeradas 1..N e agendadas em sequência considerando
                <strong> 8h/dia</strong> e <strong>dias úteis</strong> (você
                pode ajustar manualmente depois).
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!demandTypeId}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
