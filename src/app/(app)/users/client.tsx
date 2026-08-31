"use client";
import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import type { Profile } from "@/lib/types";
import { brl } from "@/lib/utils";
import { updateProfile, createClienteProfile } from "./actions";

export function UsersClient({
  profiles,
  meId,
  isAdmin,
}: {
  profiles: Profile[];
  meId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Custo/hora, jornada, permissões e clientes externos.
            {!isAdmin && " Você só pode editar o próprio perfil."}
          </p>
        </div>
        {isAdmin && (
          <CreateClienteDialog onCreated={() => router.refresh()} />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
          <CardDescription>
            Usuários internos se cadastram pela tela de login. Clientes são
            criados manualmente pelo admin e não têm acesso ao sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>E-mail</TH>
                <TH>Role</TH>
                <TH className="text-right">Custo/h</TH>
                <TH className="text-right">Jornada</TH>
                <TH>Projetos visíveis</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {profiles.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.full_name || "—"}</TD>
                  <TD className="text-muted-foreground text-sm">
                    {p.email ?? <span className="italic text-muted-foreground/50">—</span>}
                  </TD>
                  <TD>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(p.role)}`}>
                      {p.role}
                    </span>
                  </TD>
                  <TD className="text-right">
                    {p.role === "cliente" ? "—" : brl(p.custo_hora)}
                  </TD>
                  <TD className="text-right">
                    {p.role === "cliente" ? "—" : `${p.jornada_diaria_h} h`}
                  </TD>
                  <TD className="text-sm">
                    {p.role === "cliente" ? (
                      <span className="text-muted-foreground italic">n/a</span>
                    ) : p.can_view_all_projects ? (
                      "Todos"
                    ) : (
                      "Apenas os seus"
                    )}
                  </TD>
                  <TD>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.is_active
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.is_active ? "ativo" : "inativo"}
                    </span>
                  </TD>
                  <TD className="text-right">
                    {(isAdmin || p.id === meId) && (
                      <EditProfileDialog
                        profile={p}
                        canChangeRole={isAdmin}
                        onSaved={() => router.refresh()}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function roleColor(role: string) {
  if (role === "admin") return "bg-primary/10 text-primary";
  if (role === "cliente") return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  return "bg-muted text-muted-foreground";
}

function CreateClienteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [canViewAll, setCanViewAll] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="h-4 w-4 mr-2" />
          Novo cliente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar cliente externo</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            fd.set("can_view_all_projects", canViewAll ? "on" : "off");
            const r = await createClienteProfile(fd);
            if (r.error) { toast.error(r.error); return; }
            toast.success("Cliente cadastrado");
            setOpen(false);
            onCreated();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label>Nome *</Label>
            <Input name="full_name" placeholder="Nome do cliente" autoFocus />
          </div>
          <div className="grid gap-2">
            <Label>Visibilidade de projetos</Label>
            <Select
              value={canViewAll ? "all" : "own"}
              onValueChange={(v) => setCanViewAll(v === "all")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                <SelectItem value="own">Apenas projetos com participação</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Clientes não têm login. Esta configuração serve para relatórios
              e filtros futuros.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit">Cadastrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProfileDialog({
  profile,
  canChangeRole,
  onSaved,
}: {
  profile: Profile;
  canChangeRole: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(profile.role);
  const [canViewAll, setCanViewAll] = useState(profile.can_view_all_projects ?? true);
  const isCliente = role === "cliente";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile.full_name || profile.email || "Cliente"}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            if (canChangeRole) fd.set("role", role);
            fd.set("can_view_all_projects", canViewAll ? "on" : "off");
            const r = await updateProfile(profile.id, fd);
            if (r.error) { toast.error(r.error); return; }
            toast.success("Salvo");
            setOpen(false);
            onSaved();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input name="full_name" defaultValue={profile.full_name} />
          </div>

          {canChangeRole && (
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Profile["role"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="cliente">cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!isCliente && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Custo / hora (R$)</Label>
                  <Input
                    name="custo_hora"
                    type="number"
                    step="0.01"
                    defaultValue={profile.custo_hora}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Jornada (h/dia)</Label>
                  <Input
                    name="jornada_diaria_h"
                    type="number"
                    step="0.5"
                    defaultValue={profile.jornada_diaria_h}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Jornada é referência para a view de carga. Custo/hora é usado no
                timer de cada etapa (snapshot no início).
              </p>
            </>
          )}

          {isCliente && (
            <input type="hidden" name="custo_hora" value="0" />
          )}

          <div className="grid gap-2">
            <Label>Visibilidade de projetos</Label>
            <Select
              value={canViewAll ? "all" : "own"}
              onValueChange={(v) => setCanViewAll(v === "all")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                <SelectItem value="own">Apenas projetos com participação</SelectItem>
              </SelectContent>
            </Select>
            {!isCliente && (
              <p className="text-xs text-muted-foreground">
                "Apenas os seus" restringe a visão do usuário em Projetos, Gantt,
                Carga e Relatórios.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={profile.is_active}
              className="h-4 w-4"
            />
            Ativo
          </label>

          <DialogFooter>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
