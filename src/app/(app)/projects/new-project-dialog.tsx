"use client";
import { useState } from "react";
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
import type { DemandType } from "@/lib/types";
import { createProject } from "./actions";

export function NewProjectDialog({ types }: { types: DemandType[] }) {
  const [open, setOpen] = useState(false);
  const [demandTypeId, setDemandTypeId] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={types.length === 0}>
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("demand_type_id", demandTypeId);
            try {
              const r = await createProject(fd);
              if (r && "error" in r) toast.error(r.error);
            } catch (e) {
              // redirect throws — ignore
              if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_REDIRECT"))
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
              <Select value={demandTypeId} onValueChange={setDemandTypeId}>
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
              <Input name="start_date" type="date" required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            As etapas-padrão do tipo escolhido são criadas automaticamente em
            sequência (dias úteis).
          </p>
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
