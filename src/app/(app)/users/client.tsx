"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
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
import { updateProfile } from "./actions";

export function UsersClient({
  profiles,
  meId,
  isAdmin,
}: {
  profiles: Profile[];
  meId: string;
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Custo/hora, jornada diária e adicional de hora extra de cada usuário.
          {!isAdmin && " Você só pode editar o próprio perfil."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
          <CardDescription>
            Para criar um novo usuário, ele deve se cadastrar pela tela de login.
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
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {profiles.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.full_name || "—"}</TD>
                  <TD className="text-muted-foreground">{p.email}</TD>
                  <TD>{p.role}</TD>
                  <TD className="text-right">{brl(p.custo_hora)}</TD>
                  <TD className="text-right">{p.jornada_diaria_h} h</TD>
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
                      <EditProfileDialog profile={p} canChangeRole={isAdmin} />
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

function EditProfileDialog({
  profile,
  canChangeRole,
}: {
  profile: Profile;
  canChangeRole: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(profile.role);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{profile.full_name || profile.email}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => {
            if (canChangeRole) fd.set("role", role);
            const r = await updateProfile(profile.id, fd);
            if (r.error) {
              toast.error(r.error);
              return;
            }
            toast.success("Salvo — etapas atribuídas serão recalculadas");
            setOpen(false);
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
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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
