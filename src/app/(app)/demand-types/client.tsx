"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  createDemandType,
  deleteDemandType,
  deleteStageTemplate,
  updateDemandType,
  upsertStageTemplate,
} from "./actions";
import type { DemandType, StageTemplate } from "@/lib/types";
import { brl } from "@/lib/utils";

export function DemandTypesClient({
  types,
  templates,
  isAdmin,
}: {
  types: DemandType[];
  templates: StageTemplate[];
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(types[0]?.id ?? null);
  const selectedType = types.find((t) => t.id === selected) ?? null;
  const myTemplates = templates.filter((t) => t.demand_type_id === selected);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tipos de demanda
          </h1>
          <p className="text-sm text-muted-foreground">
            Defina os tipos de demanda e as etapas-padrão de cada um.
          </p>
        </div>
        {isAdmin && <NewTypeDialog />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            {types.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhum tipo cadastrado.
              </div>
            )}
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`text-left px-3 py-2 rounded-md text-sm hover:bg-accent ${
                  selected === t.id ? "bg-accent" : ""
                }`}
              >
                {t.nome}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">
                {selectedType?.nome ?? "Selecione um tipo"}
              </CardTitle>
              <CardDescription>
                Etapas-padrão. Ao criar um projeto desse tipo, essas etapas são
                copiadas como ponto de partida.
              </CardDescription>
            </div>
            {isAdmin && selectedType && (
              <div className="flex gap-2">
                <EditTypeDialog type={selectedType} />
                <DeleteTypeButton id={selectedType.id} />
                <NewTemplateDialog
                  demandTypeId={selectedType.id}
                  nextOrdem={(myTemplates.at(-1)?.ordem ?? 0) + 1}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedType ? null : myTemplates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Nenhuma etapa cadastrada para este tipo.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Etapa</TH>
                    <TH className="text-right">Horas</TH>
                    <TH className="text-right">Dias úteis</TH>
                    <TH className="text-right">Custo fixo</TH>
                    {isAdmin && <TH />}
                  </TR>
                </THead>
                <TBody>
                  {myTemplates.map((t) => (
                    <TR key={t.id}>
                      <TD className="w-12">{t.ordem}</TD>
                      <TD className="font-medium">{t.nome}</TD>
                      <TD className="text-right">{Number(t.horas_default).toFixed(1)}</TD>
                      <TD className="text-right">{t.duracao_dias_default}</TD>
                      <TD className="text-right">{brl(t.custo_fixo_default)}</TD>
                      {isAdmin && (
                        <TD className="text-right w-24">
                          <div className="flex justify-end gap-1">
                            <EditTemplateDialog template={t} />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                if (!confirm("Excluir esta etapa-padrão?")) return;
                                const r = await deleteStageTemplate(t.id);
                                if (r.error) toast.error(r.error);
                                else toast.success("Etapa removida");
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NewTypeDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Novo tipo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo tipo de demanda</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            const r = await createDemandType(fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Tipo criado");
            setOpen(false);
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input name="nome" required />
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Input name="descricao" />
          </div>
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTypeDialog({ type }: { type: DemandType }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tipo</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            const r = await updateDemandType(type.id, fd);
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
            <Input name="nome" defaultValue={type.nome} required />
          </div>
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Input name="descricao" defaultValue={type.descricao ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTypeButton({ id }: { id: string }) {
  return (
    <Button
      size="icon"
      variant="outline"
      onClick={async () => {
        if (!confirm("Excluir esse tipo? As etapas-padrão também serão removidas."))
          return;
        const r = await deleteDemandType(id);
        if (r.error) toast.error(r.error);
        else toast.success("Tipo removido");
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function NewTemplateDialog({
  demandTypeId,
  nextOrdem,
}: {
  demandTypeId: string;
  nextOrdem: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Etapa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova etapa-padrão</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("demand_type_id", demandTypeId);
            const r = await upsertStageTemplate(fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Etapa adicionada");
            setOpen(false);
          }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Ordem</Label>
              <Input name="ordem" type="number" defaultValue={nextOrdem} required />
            </div>
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input name="nome" required />
            </div>
            <div className="grid gap-2">
              <Label>Horas</Label>
              <Input name="horas_default" type="number" step="0.5" defaultValue={8} />
            </div>
            <div className="grid gap-2">
              <Label>Dias úteis</Label>
              <Input
                name="duracao_dias_default"
                type="number"
                defaultValue={1}
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Custo fixo (R$)</Label>
              <Input
                name="custo_fixo_default"
                type="number"
                step="0.01"
                defaultValue={0}
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

function EditTemplateDialog({ template }: { template: StageTemplate }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar etapa-padrão</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("id", template.id);
            fd.set("demand_type_id", template.demand_type_id);
            const r = await upsertStageTemplate(fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Salvo");
            setOpen(false);
          }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Ordem</Label>
              <Input name="ordem" type="number" defaultValue={template.ordem} required />
            </div>
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input name="nome" defaultValue={template.nome} required />
            </div>
            <div className="grid gap-2">
              <Label>Horas</Label>
              <Input
                name="horas_default"
                type="number"
                step="0.5"
                defaultValue={template.horas_default}
              />
            </div>
            <div className="grid gap-2">
              <Label>Dias úteis</Label>
              <Input
                name="duracao_dias_default"
                type="number"
                defaultValue={template.duracao_dias_default}
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label>Custo fixo (R$)</Label>
              <Input
                name="custo_fixo_default"
                type="number"
                step="0.01"
                defaultValue={template.custo_fixo_default}
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
