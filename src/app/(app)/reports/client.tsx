"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { brl, fmtDate } from "@/lib/utils";
import { StatusPill, deriveStageStatus } from "@/lib/stage-status";
import type {
  Profile,
  Project,
  ProjectStage,
  StageRealView,
} from "@/lib/types";

const ProjectGantt = dynamic(() => import("@/components/project-gantt"), {
  ssr: false,
});

type ProjectWithType = Project & { demand_types: { nome: string } | null };
type StageWithExtras = ProjectStage & {
  profiles: { full_name: string } | null;
  projects: { nome: string } | null;
};
type UserOpt = Pick<Profile, "id" | "full_name" | "email">;

const STATUS_OPTS = [
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "atrasado", label: "Atrasado (derivado)" },
];

export function ReportsClient({
  projects,
  users,
  allStages,
  allReal,
  report,
  preselected,
}: {
  projects: ProjectWithType[];
  users: UserOpt[];
  allStages: StageWithExtras[];
  allReal: StageRealView[];
  report: {
    projects: ProjectWithType[];
    stages: StageWithExtras[];
    real: StageRealView[];
  } | null;
  preselected: string[];
}) {
  // Se URL tem ?ids=..., já abre em modo "por projeto" e mostra o relatório
  if (report) {
    return (
      <ByProjectReport
        report={report}
        backHref="/reports"
        realByStage={new Map(report.real.map((r) => [r.stage_id, r]))}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Exporte em PDF (A4 paisagem) por projeto ou em uma visão consolidada
          com filtros.
        </p>
      </div>
      <Tabs defaultValue="byProject">
        <TabsList>
          <TabsTrigger value="byProject">Por projeto</TabsTrigger>
          <TabsTrigger value="consolidated">Consolidado (filtros)</TabsTrigger>
        </TabsList>
        <TabsContent value="byProject">
          <ByProjectSelector projects={projects} preselected={preselected} />
        </TabsContent>
        <TabsContent value="consolidated">
          <ConsolidatedReport
            projects={projects}
            users={users}
            allStages={allStages}
            allReal={allReal}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// MODE A: por projeto (selector + report)
// ============================================================
function ByProjectSelector({
  projects,
  preselected,
}: {
  projects: ProjectWithType[];
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
    router.push(`/reports?ids=${Array.from(selected).join(",")}`);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">Projetos disponíveis</CardTitle>
          <CardDescription>
            {selected.size} de {projects.length} selecionado(s).
            Cada projeto sai em uma página separada no PDF.
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
  );
}

function ByProjectReport({
  report,
  backHref,
  realByStage,
}: {
  report: {
    projects: ProjectWithType[];
    stages: StageWithExtras[];
    real: StageRealView[];
  };
  backHref: string;
  realByStage: Map<string, StageRealView>;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório de projetos
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.projects.length} projeto(s) · {report.stages.length} etapa(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={backHref}>
            <Button variant="outline">Voltar à seleção</Button>
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-semibold">
          AutGantt — Relatório de projetos
        </h1>
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
                      <TH>Status</TH>
                      <TH className="text-right">Horas est.</TH>
                      <TH className="text-right">Horas reais</TH>
                      <TH className="text-right">Custo real</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ps.map((s) => {
                      const r = realByStage.get(s.id);
                      const derived = deriveStageStatus(
                        s,
                        Number(r?.horas_reais ?? 0) > 0,
                      );
                      return (
                        <TR key={s.id}>
                          <TD>{s.ordem}</TD>
                          <TD className="font-medium">{s.nome}</TD>
                          <TD>{s.profiles?.full_name ?? "—"}</TD>
                          <TD>{fmtDate(s.start_date)}</TD>
                          <TD>{fmtDate(s.end_date)}</TD>
                          <TD>
                            <StatusPill status={derived} />
                          </TD>
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

// ============================================================
// MODE B: Consolidado com filtros
// ============================================================
function ConsolidatedReport({
  projects,
  users,
  allStages,
  allReal,
}: {
  projects: ProjectWithType[];
  users: UserOpt[];
  allStages: StageWithExtras[];
  allReal: StageRealView[];
}) {
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.nome }));
  const userOpts = [
    ...users.map((u) => ({ value: u.id, label: u.full_name || u.email || "—" })),
    { value: "__none__", label: "(sem responsável)" },
  ];

  const [projectIds, setProjectIds] = useState<Set<string>>(
    () => new Set(projectOpts.map((o) => o.value)),
  );
  const [userIds, setUserIds] = useState<Set<string>>(
    () => new Set(userOpts.map((o) => o.value)),
  );
  const [statuses, setStatuses] = useState<Set<string>>(
    () => new Set(STATUS_OPTS.map((o) => o.value)),
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const realByStage = useMemo(
    () => new Map(allReal.map((r) => [r.stage_id, r])),
    [allReal],
  );

  const filtered = useMemo(() => {
    return allStages.filter((s) => {
      if (!projectIds.has(s.project_id)) return false;
      const userKey = s.assignee_id ?? "__none__";
      if (!userIds.has(userKey)) return false;
      const real = realByStage.get(s.id);
      const derived = deriveStageStatus(
        s,
        Number(real?.horas_reais ?? 0) > 0,
      );
      if (!statuses.has(derived)) return false;
      // Período: a etapa precisa intersectar [from,to]
      if (dateFrom && s.end_date < dateFrom) return false;
      if (dateTo && s.start_date > dateTo) return false;
      return true;
    });
  }, [allStages, projectIds, userIds, statuses, dateFrom, dateTo, realByStage]);

  const totH = filtered.reduce(
    (a, s) => a + Number(realByStage.get(s.id)?.horas_reais ?? 0),
    0,
  );
  const totC = filtered.reduce(
    (a, s) => a + Number(realByStage.get(s.id)?.custo_real ?? 0),
    0,
  );
  const totEst = filtered.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );
  const projectsInFilter = new Set(filtered.map((s) => s.project_id)).size;

  function clearFilters() {
    setProjectIds(new Set(projectOpts.map((o) => o.value)));
    setUserIds(new Set(userOpts.map((o) => o.value)));
    setStatuses(new Set(STATUS_OPTS.map((o) => o.value)));
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="grid gap-4">
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <MultiSelect
              label="Projetos"
              options={projectOpts}
              values={projectIds}
              onChange={setProjectIds}
            />
            <MultiSelect
              label="Usuários"
              options={userOpts}
              values={userIds}
              onChange={setUserIds}
            />
            <MultiSelect
              label="Status"
              options={STATUS_OPTS}
              values={statuses}
              onChange={setStatuses}
            />
            <div className="grid gap-1">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {filtered.length} etapa(s) · {projectsInFilter} projeto(s)
          {dateFrom || dateTo
            ? ` · ${dateFrom ? fmtDate(dateFrom) : "…"} → ${
                dateTo ? fmtDate(dateTo) : "…"
              }`
            : ""}
        </div>
        <PrintButton label="Exportar consolidado (PDF)" />
      </div>

      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-semibold">
          AutGantt — Relatório consolidado
        </h1>
        <p className="text-xs text-gray-600">
          {filtered.length} etapa(s) · {projectsInFilter} projeto(s) · Gerado em{" "}
          {new Date().toLocaleString("pt-BR")}
          {dateFrom || dateTo
            ? ` · ${dateFrom ? fmtDate(dateFrom) : "…"} → ${
                dateTo ? fmtDate(dateTo) : "…"
              }`
            : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat label="Etapas" value={filtered.length} />
        <SummaryStat label="Projetos" value={projectsInFilter} />
        <SummaryStat
          label="Horas reais / est."
          value={`${totH.toFixed(1)} h / ${totEst.toFixed(1)} h`}
        />
        <SummaryStat label="Custo real" value={brl(totC)} />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Nenhuma etapa atende aos filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gantt consolidado</CardTitle>
            <CardDescription>
              Etapas agrupadas por projeto. Datas, status e custo são derivados
              dos apontamentos reais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectGantt
              stages={filtered}
              real={allReal}
              readOnly
              groupByProject
            />
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Etapas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Projeto</TH>
                  <TH>Etapa</TH>
                  <TH>Responsável</TH>
                  <TH>Início</TH>
                  <TH>Fim</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Horas est.</TH>
                  <TH className="text-right">Horas reais</TH>
                  <TH className="text-right">Custo real</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => {
                  const r = realByStage.get(s.id);
                  const derived = deriveStageStatus(
                    s,
                    Number(r?.horas_reais ?? 0) > 0,
                  );
                  return (
                    <TR key={s.id}>
                      <TD className="text-xs text-muted-foreground">
                        {s.projects?.nome ?? "—"}
                      </TD>
                      <TD className="font-medium">
                        {s.ordem}. {s.nome}
                      </TD>
                      <TD>{s.profiles?.full_name ?? "—"}</TD>
                      <TD>{fmtDate(s.start_date)}</TD>
                      <TD>{fmtDate(s.end_date)}</TD>
                      <TD>
                        <StatusPill status={derived} />
                      </TD>
                      <TD className="text-right">
                        {Number(s.horas_estimadas).toFixed(1)}
                      </TD>
                      <TD className="text-right">
                        {Number(r?.horas_reais ?? 0).toFixed(1)}
                      </TD>
                      <TD className="text-right">{brl(r?.custo_real ?? 0)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className="text-lg font-semibold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}
