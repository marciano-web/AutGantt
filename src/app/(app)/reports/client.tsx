"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { brl, fmtDate } from "@/lib/utils";
import type {
  Project,
  ProjectStage,
  StageRealView,
} from "@/lib/types";

const ProjectGantt = dynamic(() => import("@/components/project-gantt"), {
  ssr: false,
});

type ProjectWithType = Project & { demand_types: { nome: string } | null };
type StageWithProfile = ProjectStage & {
  profiles: { full_name: string } | null;
};

export function ReportsClient({
  projects,
  report,
  preselected,
}: {
  projects: ProjectWithType[];
  report: {
    projects: ProjectWithType[];
    stages: StageWithProfile[];
    real: StageRealView[];
  } | null;
  preselected: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function generate() {
    const ids = Array.from(selected).join(",");
    router.push(`/reports?ids=${ids}`);
  }

  if (report) {
    const realByStage = new Map(report.real.map((r) => [r.stage_id, r]));
    return (
      <div className="grid gap-6">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Relatório de projetos
            </h1>
            <p className="text-sm text-muted-foreground">
              {report.projects.length} projeto(s) ·{" "}
              {report.stages.length} etapa(s)
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/reports">
              <Button variant="outline">Voltar à seleção</Button>
            </Link>
            <PrintButton />
          </div>
        </div>

        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-semibold">AutGantt — Relatório de projetos</h1>
          <p className="text-xs text-gray-600">
            Gerado em {new Date().toLocaleString("pt-BR")}
          </p>
        </div>

        {report.projects.map((p) => {
          const ps = report.stages.filter((s) => s.project_id === p.id);
          const totH = ps.reduce(
            (a, s) => a + Number(realByStage.get(s.id)?.horas_reais ?? 0),
            0,
          );
          const totC = ps.reduce(
            (a, s) => a + Number(realByStage.get(s.id)?.custo_real ?? 0),
            0,
          );
          const totEst = ps.reduce(
            (a, s) => a + Number(s.horas_estimadas ?? 0),
            0,
          );
          return (
            <div key={p.id} className="print-page grid gap-4">
              <div className="border-b border-border pb-3">
                <h2 className="text-xl font-semibold">{p.nome}</h2>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  <span>Tipo: {p.demand_types?.nome ?? "—"}</span>
                  {p.cliente && <span>Cliente: {p.cliente}</span>}
                  <span>Status: {p.status.replace("_", " ")}</span>
                  <span>
                    Período: {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                  </span>
                  <span>
                    Horas reais/est: {totH.toFixed(1)} h / {totEst.toFixed(1)} h
                  </span>
                  <span className="font-medium">Custo real: {brl(totC)}</span>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <THead>
                      <TR>
                        <TH>#</TH>
                        <TH>Etapa</TH>
                        <TH>Responsável</TH>
                        <TH>Início</TH>
                        <TH>Fim</TH>
                        <TH className="text-right">Horas est.</TH>
                        <TH className="text-right">Horas reais</TH>
                        <TH className="text-right">Custo real</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {ps.map((s) => {
                        const r = realByStage.get(s.id);
                        return (
                          <TR key={s.id}>
                            <TD>{s.ordem}</TD>
                            <TD className="font-medium">{s.nome}</TD>
                            <TD>{s.profiles?.full_name ?? "—"}</TD>
                            <TD>{fmtDate(s.start_date)}</TD>
                            <TD>{fmtDate(s.end_date)}</TD>
                            <TD className="text-right">
                              {Number(s.horas_estimadas).toFixed(1)}
                            </TD>
                            <TD className="text-right">
                              {Number(r?.horas_reais ?? 0).toFixed(1)}
                            </TD>
                            <TD className="text-right">
                              {brl(r?.custo_real ?? 0)}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              {ps.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Gantt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProjectGantt
                      stages={ps}
                      real={report.real.filter((r) => r.project_id === p.id)}
                      readOnly
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Selecione os projetos para gerar um relatório consolidado em PDF (A4
          paisagem) com etapas, prazos e Gantt.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Projetos disponíveis</CardTitle>
            <CardDescription>
              {selected.size} selecionado(s) de {projects.length}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setSelected(
                  selected.size === projects.length
                    ? new Set()
                    : new Set(projects.map((p) => p.id)),
                )
              }
            >
              {selected.size === projects.length ? "Limpar" : "Selecionar todos"}
            </Button>
            <Button onClick={generate} disabled={selected.size === 0}>
              <FileText className="h-4 w-4" />
              Gerar relatório
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH className="w-10" />
                <TH>Projeto</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH>Status</TH>
                <TH>Período</TH>
              </TR>
            </THead>
            <TBody>
              {projects.length === 0 && (
                <TR>
                  <TD
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum projeto.
                  </TD>
                </TR>
              )}
              {projects.map((p) => (
                <TR
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="cursor-pointer"
                >
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      readOnly
                      className="h-4 w-4"
                    />
                  </TD>
                  <TD className="font-medium">{p.nome}</TD>
                  <TD className="text-muted-foreground">
                    {p.demand_types?.nome ?? "—"}
                  </TD>
                  <TD>{p.cliente ?? "—"}</TD>
                  <TD>{p.status.replace("_", " ")}</TD>
                  <TD className="text-xs">
                    {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
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
