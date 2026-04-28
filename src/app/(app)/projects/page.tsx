import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { brl, fmtDate } from "@/lib/utils";
import { NewProjectDialog } from "./new-project-dialog";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: projects }, { data: types }, { data: costs }] = await Promise.all([
    supabase
      .from("projects")
      .select("*, demand_types(nome)")
      .order("created_at", { ascending: false }),
    supabase.from("demand_types").select("*").eq("is_active", true).order("nome"),
    supabase.from("v_project_costs").select("*"),
  ]);

  const costMap = new Map((costs ?? []).map((c) => [c.project_id, c]));

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Cada projeto é uma demanda com etapas, datas, responsáveis e custo.
          </p>
        </div>
        <NewProjectDialog types={types ?? []} />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Projeto</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH>Status</TH>
                <TH>Início</TH>
                <TH>Fim</TH>
                <TH className="text-right">Etapas</TH>
                <TH className="text-right">Horas</TH>
                <TH className="text-right">Custo</TH>
              </TR>
            </THead>
            <TBody>
              {projects?.length === 0 && (
                <TR>
                  <TD colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhum projeto.
                  </TD>
                </TR>
              )}
              {projects?.map((p) => {
                const c = costMap.get(p.id);
                return (
                  <TR key={p.id} className="cursor-pointer">
                    <TD className="font-medium">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.nome}
                      </Link>
                    </TD>
                    <TD className="text-muted-foreground">
                      {(p.demand_types as { nome: string } | null)?.nome ?? "—"}
                    </TD>
                    <TD>{p.cliente ?? "—"}</TD>
                    <TD>
                      <StatusPill status={p.status} />
                    </TD>
                    <TD>{fmtDate(p.start_date)}</TD>
                    <TD>{fmtDate(p.end_date)}</TD>
                    <TD className="text-right">{c?.qtd_etapas ?? 0}</TD>
                    <TD className="text-right">
                      {Number(c?.horas_total ?? 0).toFixed(1)} h
                    </TD>
                    <TD className="text-right font-medium">
                      {brl(c?.custo_total ?? 0)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    planejado: "bg-muted text-muted-foreground",
    em_andamento: "bg-primary/10 text-primary",
    pausado: "bg-warn/10 text-warn",
    concluido: "bg-success/10 text-success",
    cancelado: "bg-danger/10 text-danger",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {status.replace("_", " ")}
    </span>
  );
}
