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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { CustomGantt } from "@/components/custom-gantt";
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
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Exporte em PDF (A4 paisagem) por projeto ou em uma visão consolidada
          com filtros.
        </p>
      </div>
      <Tabs defaultValue="byProject">
        <TabsList className="print:hidden">
          <TabsTrigger value="byProject">Por projeto</TabsTrigger>
          <TabsTrigger value="consolidated">Consolidado (filtros)</TabsTrigger>
          <TabsTrigger value="ganttVisual">Gantt visual</TabsTrigger>
          <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
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
        <TabsContent value="ganttVisual">
          <GanttVisualReport
            projects={projects}
            users={users}
            allStages={allStages}
            allReal={allReal}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineReport
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
                      <TH style={{ width: "4%" }}>#</TH>
                      <TH style={{ width: "26%" }}>Etapa</TH>
                      <TH style={{ width: "18%" }}>Responsável</TH>
                      <TH style={{ width: "9%" }}>Início</TH>
                      <TH style={{ width: "9%" }}>Fim</TH>
                      <TH style={{ width: "11%" }}>Status</TH>
                      <TH style={{ width: "7%" }} className="text-right">
                        Horas est.
                      </TH>
                      <TH style={{ width: "7%" }} className="text-right">
                        Horas reais
                      </TH>
                      <TH style={{ width: "9%" }} className="text-right">
                        Custo real
                      </TH>
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
              <>
                {/* Tela: wamra Gantt interativo */}
                <Card className="print:hidden">
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
                {/* Print: CustomGantt monolitico que cabe em paisagem */}
                <Card className="hidden print:block print:border-0 print:shadow-none">
                  <CardContent className="print:p-0">
                    <CustomGantt
                      stages={ps}
                      hasTimeLogged={(id) =>
                        Number(realByStage.get(id)?.horas_reais ?? 0) > 0
                      }
                    />
                  </CardContent>
                </Card>
              </>
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

      <div className="flex items-center justify-between gap-4 print:hidden">
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
        <>
          {/* Tela: wamra Gantt (interativo, com Dia/Semana/Mes) */}
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gantt consolidado</CardTitle>
              <CardDescription>
                Etapas agrupadas por projeto. Datas, status e custo são
                derivados dos apontamentos reais.
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
          {/* Print: CustomGantt (SVG monolitico que cabe em paisagem A4) */}
          <Card className="hidden print:block print:border-0 print:shadow-none">
            <CardContent className="print:p-0">
              <CustomGantt
                stages={filtered}
                hasTimeLogged={(id) =>
                  Number(realByStage.get(id)?.horas_reais ?? 0) > 0
                }
              />
            </CardContent>
          </Card>
        </>
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
                  <TH style={{ width: "14%" }}>Projeto</TH>
                  <TH style={{ width: "22%" }}>Etapa</TH>
                  <TH style={{ width: "16%" }}>Responsável</TH>
                  <TH style={{ width: "8%" }}>Início</TH>
                  <TH style={{ width: "8%" }}>Fim</TH>
                  <TH style={{ width: "11%" }}>Status</TH>
                  <TH style={{ width: "7%" }} className="text-right">
                    Horas est.
                  </TH>
                  <TH style={{ width: "7%" }} className="text-right">
                    Horas reais
                  </TH>
                  <TH style={{ width: "7%" }} className="text-right">
                    Custo real
                  </TH>
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

// ============================================================
// MODE C: Gantt visual (sem tabelas) — SVG custom otimizado pra print
// ============================================================
function GanttVisualReport({
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
    ...users.map((u) => ({
      value: u.id,
      label: u.full_name || u.email || "—",
    })),
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
      if (dateFrom && s.end_date < dateFrom) return false;
      if (dateTo && s.start_date > dateTo) return false;
      return true;
    });
  }, [allStages, projectIds, userIds, statuses, dateFrom, dateTo, realByStage]);

  function clearFilters() {
    setProjectIds(new Set(projectOpts.map((o) => o.value)));
    setUserIds(new Set(userOpts.map((o) => o.value)));
    setStatuses(new Set(STATUS_OPTS.map((o) => o.value)));
    setDateFrom("");
    setDateTo("");
  }

  const projectsInFilter = new Set(filtered.map((s) => s.project_id)).size;
  const totH = filtered.reduce(
    (a, s) => a + Number(realByStage.get(s.id)?.horas_reais ?? 0),
    0,
  );
  const totEst = filtered.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );

  function hasTimeLogged(stageId: string): boolean {
    return Number(realByStage.get(stageId)?.horas_reais ?? 0) > 0;
  }

  return (
    <div className="grid gap-4">
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Visual síntese: barras coloridas por status, agrupadas por projeto,
            sobre um eixo de meses. Sem tabelas.
          </CardDescription>
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

      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="text-sm text-muted-foreground">
          {filtered.length} etapa(s) · {projectsInFilter} projeto(s)
        </div>
        <PrintButton label="Exportar Gantt (PDF)" />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-3 print:p-0">
          <div className="hidden print:block mb-1">
            <h1 className="text-base font-semibold">
              AutGantt — Gantt visual
            </h1>
            <p className="text-[8pt] text-gray-600 leading-tight">
              {filtered.length} etapa(s) · {projectsInFilter} projeto(s) ·{" "}
              {totEst.toFixed(1)} h estimada(s) · Gerado em{" "}
              {new Date().toLocaleString("pt-BR")}
              {dateFrom || dateTo
                ? ` · ${dateFrom ? fmtDate(dateFrom) : "…"} → ${
                    dateTo ? fmtDate(dateTo) : "…"
                  }`
                : ""}
            </p>
          </div>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Nenhuma etapa atende aos filtros.
            </div>
          ) : (
            <CustomGantt stages={filtered} hasTimeLogged={hasTimeLogged} />
          )}
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <Card className="print:break-before-page">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalhamento das etapas</CardTitle>
            <CardDescription>
              {filtered.length} etapa(s) agrupada(s) por projeto. Datas e
              status conforme exibidos no Gantt acima.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH style={{ width: "20%" }}>Projeto</TH>
                  <TH style={{ width: "32%" }}>Etapa</TH>
                  <TH style={{ width: "18%" }}>Responsável</TH>
                  <TH style={{ width: "9%" }}>Início</TH>
                  <TH style={{ width: "9%" }}>Fim</TH>
                  <TH style={{ width: "12%" }}>Status</TH>
                </TR>
              </THead>
              <TBody>
                {[...filtered]
                  .sort((a, b) => {
                    const projA = a.projects?.nome ?? "";
                    const projB = b.projects?.nome ?? "";
                    return (
                      projA.localeCompare(projB) ||
                      a.ordem - b.ordem ||
                      a.start_date.localeCompare(b.start_date)
                    );
                  })
                  .map((s) => {
                    const r = realByStage.get(s.id);
                    const status = deriveStageStatus(
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
                          <StatusPill status={status} />
                        </TD>
                      </TR>
                    );
                  })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="text-xs text-muted-foreground print:hidden">
          {totH.toFixed(1)} h reais / {totEst.toFixed(1)} h estimadas
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODE D: Linha do tempo (entregas previstas por bucket)
// ============================================================
type Granularity =
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "trimestral"
  | "semestral"
  | "anual";

const GRAN_OPTS: { value: Granularity; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

function TimelineReport({
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
    ...users.map((u) => ({
      value: u.id,
      label: u.full_name || u.email || "—",
    })),
    { value: "__none__", label: "(sem responsável)" },
  ];

  // Status default: tudo menos "cancelado" (entrega cancelada nao e entrega prevista)
  const TIMELINE_STATUSES = STATUS_OPTS.filter((o) => o.value !== "cancelado");

  const [projectIds, setProjectIds] = useState<Set<string>>(
    () => new Set(projectOpts.map((o) => o.value)),
  );
  const [userIds, setUserIds] = useState<Set<string>>(
    () => new Set(userOpts.map((o) => o.value)),
  );
  const [statuses, setStatuses] = useState<Set<string>>(
    () => new Set(TIMELINE_STATUSES.map((o) => o.value)),
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("mensal");

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
      // Aqui o filtro de periodo aplica sobre end_date (data de entrega prevista)
      if (dateFrom && s.end_date < dateFrom) return false;
      if (dateTo && s.end_date > dateTo) return false;
      return true;
    });
  }, [allStages, projectIds, userIds, statuses, dateFrom, dateTo, realByStage]);

  function clearFilters() {
    setProjectIds(new Set(projectOpts.map((o) => o.value)));
    setUserIds(new Set(userOpts.map((o) => o.value)));
    setStatuses(new Set(TIMELINE_STATUSES.map((o) => o.value)));
    setDateFrom("");
    setDateTo("");
  }

  // Agrupa em buckets por end_date
  type Bucket = {
    key: string;
    label: string;
    rangeStart: Date;
    rangeEnd: Date;
    stages: StageWithExtras[];
  };
  const buckets: Bucket[] = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const s of filtered) {
      const endDate = new Date(s.end_date + "T00:00:00");
      const r = bucketRange(endDate, granularity);
      if (!map.has(r.key)) {
        map.set(r.key, {
          key: r.key,
          label: r.label,
          rangeStart: r.start,
          rangeEnd: r.end,
          stages: [],
        });
      }
      map.get(r.key)!.stages.push(s);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.rangeStart.getTime() - b.rangeStart.getTime());
    // Ordena etapas dentro do bucket por end_date asc
    for (const b of arr)
      b.stages.sort((a, b) => a.end_date.localeCompare(b.end_date));
    return arr;
  }, [filtered, granularity]);

  const totalEntregas = filtered.length;
  const totalProjetos = new Set(filtered.map((s) => s.project_id)).size;
  const totalH = filtered.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );

  return (
    <div className="grid gap-4">
      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Entregas previstas (data de fim de cada etapa) agrupadas por
            período. Cancelado fica fora por padrão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
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
              <Label className="text-xs">De (fim ≥)</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Até (fim ≤)</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Granularidade</Label>
              <Select
                value={granularity}
                onValueChange={(v) => setGranularity(v as Granularity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRAN_OPTS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="text-sm text-muted-foreground">
          {totalEntregas} entrega(s) · {totalProjetos} projeto(s) ·{" "}
          {buckets.length} {granLabel(granularity)}
        </div>
        <PrintButton label="Exportar linha do tempo (PDF)" />
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-4 print:p-0">
          <div className="hidden print:block mb-1">
            <h1 className="text-base font-semibold">
              AutGantt — Linha do tempo de entregas
            </h1>
            <p className="text-[8pt] text-gray-600 leading-tight">
              Granularidade: {granLabel(granularity)} · {totalEntregas}{" "}
              entrega(s) · {totalProjetos} projeto(s) ·{" "}
              {totalH.toFixed(1)} h estimada(s) · Gerado em{" "}
              {new Date().toLocaleString("pt-BR")}
              {dateFrom || dateTo
                ? ` · ${dateFrom ? fmtDate(dateFrom) : "…"} → ${
                    dateTo ? fmtDate(dateTo) : "…"
                  }`
                : ""}
            </p>
          </div>
          {buckets.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Nenhuma entrega prevista nos filtros selecionados.
            </div>
          ) : (
            <TimelineInfographic
              buckets={buckets.map((b) => ({
                key: b.key,
                label: b.label,
                shortLabel: shortBucketLabel(b.label, granularity),
                stages: b.stages,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// === Timeline infografica ===
const BLOCK_COLORS = [
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#dc2626", // red-600
  "#a855f7", // purple-500
  "#7c3aed", // violet-600
  "#3b82f6", // blue-500
  "#14b8a6", // teal-500
  "#10b981", // emerald-500
];

type InfographicBucket = {
  key: string;
  label: string;
  shortLabel: string;
  stages: StageWithExtras[];
};

// Maximo de buckets por linha em modo PDF/print (A4 paisagem ~1046px uteis)
const PRINT_BUCKETS_PER_ROW = 5;

function TimelineInfographic({
  buckets,
}: {
  buckets: InfographicBucket[];
}) {
  // Quebra em linhas pra impressao
  const printRows: InfographicBucket[][] = [];
  for (let i = 0; i < buckets.length; i += PRINT_BUCKETS_PER_ROW) {
    printRows.push(buckets.slice(i, i + PRINT_BUCKETS_PER_ROW));
  }

  return (
    <>
      {/* Visualizacao na tela: linha unica horizontal com scroll */}
      <div className="overflow-x-auto print:hidden">
        <TimelineRow buckets={buckets} startIdx={0} fitMode="screen" />
      </div>

      {/* Impressao: dividido em linhas de PRINT_BUCKETS_PER_ROW */}
      <div className="hidden print:block">
        {printRows.map((chunk, ci) => (
          <div
            key={ci}
            className={`break-inside-avoid ${ci > 0 ? "mt-6" : ""}`}
          >
            <TimelineRow
              buckets={chunk}
              startIdx={ci * PRINT_BUCKETS_PER_ROW}
              fitMode="print"
            />
          </div>
        ))}
      </div>
    </>
  );
}

function TimelineRow({
  buckets,
  startIdx,
  fitMode,
}: {
  buckets: InfographicBucket[];
  startIdx: number;
  fitMode: "screen" | "print";
}) {
  const cols =
    fitMode === "screen"
      ? `repeat(${buckets.length}, minmax(180px, 1fr))`
      : `repeat(${buckets.length}, minmax(0, 1fr))`; // print: shrink to fit

  return (
    <div
      className="grid items-stretch"
      style={{ gridTemplateColumns: cols, gap: 0 }}
    >
      {/* Paineis de cima */}
      {buckets.map((b, i) => {
        const realIdx = startIdx + i;
        const above = realIdx % 2 === 0;
        const color = BLOCK_COLORS[realIdx % BLOCK_COLORS.length];
        return (
          <TimelineCell
            key={`top-${b.key}`}
            bucket={b}
            color={color}
            show={above}
            side="above"
          />
        );
      })}

      {/* Blocos centrais */}
      {buckets.map((b, i) => {
        const realIdx = startIdx + i;
        const color = BLOCK_COLORS[realIdx % BLOCK_COLORS.length];
        return (
          <div
            key={`block-${b.key}`}
            className="text-center font-bold text-white py-3 px-2 text-sm tracking-wide self-center"
            style={{
              background: color,
              lineHeight: 1.1,
            }}
          >
            <div className="text-[11pt] leading-tight">{b.shortLabel}</div>
            <div className="text-[8pt] font-medium opacity-90 mt-0.5">
              {b.stages.length} entrega{b.stages.length === 1 ? "" : "s"}
            </div>
          </div>
        );
      })}

      {/* Paineis de baixo */}
      {buckets.map((b, i) => {
        const realIdx = startIdx + i;
        const above = realIdx % 2 === 0;
        const color = BLOCK_COLORS[realIdx % BLOCK_COLORS.length];
        return (
          <TimelineCell
            key={`bot-${b.key}`}
            bucket={b}
            color={color}
            show={!above}
            side="below"
          />
        );
      })}
    </div>
  );
}

function TimelineCell({
  bucket,
  color,
  show,
  side,
}: {
  bucket: InfographicBucket;
  color: string;
  show: boolean;
  side: "above" | "below";
}) {
  if (!show) {
    return <div />; // espaco vazio na grade
  }
  // Agrupa entregas por projeto pra ficar compacto
  const byProject = new Map<string, StageWithExtras[]>();
  for (const s of bucket.stages) {
    const k = s.projects?.nome ?? "—";
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k)!.push(s);
  }
  const projectGroups = Array.from(byProject.entries());

  return (
    <div
      className={`px-2 py-2 relative ${
        side === "above" ? "self-end" : "self-start"
      }`}
    >
      {/* Linha vertical conectora + bolinha */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-px"
        style={{
          background: color,
          top: side === "above" ? "60%" : 0,
          bottom: side === "above" ? 0 : "60%",
        }}
      />
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2 border-white ${
          side === "above" ? "bottom-0" : "top-0"
        }`}
        style={{ background: color }}
      />

      {/* Conteudo do painel */}
      <div
        className={`relative ${
          side === "above" ? "pb-3 text-right" : "pt-3"
        }`}
      >
        <h3
          className="font-bold text-[10pt] leading-tight mb-1.5"
          style={{ color }}
        >
          {bucket.label}
        </h3>
        <ul
          className={`text-[8.5pt] space-y-1 ${
            side === "above" ? "list-none" : "list-none"
          }`}
        >
          {projectGroups.map(([projectName, stages]) => (
            <li key={projectName} className="leading-tight">
              <div className="font-semibold text-[8.5pt] text-foreground">
                {projectName}
              </div>
              <ul
                className={`text-[8pt] text-muted-foreground ${
                  side === "above" ? "" : ""
                }`}
              >
                {stages.map((s) => (
                  <li key={s.id} className="flex gap-1.5 leading-snug">
                    {side === "above" ? (
                      <>
                        <span className="flex-1">
                          {s.ordem}. {s.nome}
                        </span>
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: color }}
                        />
                      </>
                    ) : (
                      <>
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: color }}
                        />
                        <span className="flex-1">
                          {s.ordem}. {s.nome}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function shortBucketLabel(longLabel: string, gran: Granularity): string {
  // Reduz "Maio/2026" → "MAI/26", "1º trimestre/2026" → "T1/26", "Semana 18/2026" → "SEM 18/26"
  switch (gran) {
    case "mensal": {
      const m = longLabel.match(/^(\w+)\/(\d{4})$/);
      if (m) {
        const monthShort = m[1].slice(0, 3).toUpperCase();
        return `${monthShort}/${m[2].slice(2)}`;
      }
      return longLabel.toUpperCase();
    }
    case "trimestral": {
      const m = longLabel.match(/^(\d)º trimestre\/(\d{4})$/);
      if (m) return `T${m[1]}/${m[2].slice(2)}`;
      return longLabel;
    }
    case "semestral": {
      const m = longLabel.match(/^(\d)º semestre\/(\d{4})$/);
      if (m) return `S${m[1]}/${m[2].slice(2)}`;
      return longLabel;
    }
    case "anual":
      return longLabel;
    case "quinzenal": {
      const m = longLabel.match(/(\d)ª quinzena de (\w+)\/(\d{4})/);
      if (m) {
        const monthShort = m[2].slice(0, 3).toUpperCase();
        return `Q${m[1]} ${monthShort}/${m[3].slice(2)}`;
      }
      return longLabel;
    }
    case "semanal": {
      const m = longLabel.match(/^Semana (\d+)\/(\d{4})/);
      if (m) return `SEM ${m[1]}/${m[2].slice(2)}`;
      return longLabel;
    }
  }
}

function granLabel(g: Granularity, lower = false): string {
  const map: Record<Granularity, string> = {
    semanal: "semana(s)",
    quinzenal: "quinzena(s)",
    mensal: "mês(es)",
    trimestral: "trimestre(s)",
    semestral: "semestre(s)",
    anual: "ano(s)",
  };
  const v = map[g];
  return lower ? v : v;
}

// === bucket helpers ===
function bucketRange(
  date: Date,
  gran: Granularity,
): { start: Date; end: Date; key: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const monthName = (mi: number) =>
    new Date(2000, mi, 1)
      .toLocaleDateString("pt-BR", { month: "long" })
      .replace(/^./, (c) => c.toUpperCase());
  const shortDate = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, "0")}/${String(
      dt.getMonth() + 1,
    ).padStart(2, "0")}`;

  switch (gran) {
    case "semanal": {
      const dayIdx = (date.getDay() + 6) % 7; // segunda=0, domingo=6
      const start = new Date(y, m, d - dayIdx);
      const end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 6,
      );
      const week = isoWeek(start);
      return {
        start,
        end,
        key: `s-${start.toISOString().slice(0, 10)}`,
        label: `Semana ${week}/${start.getFullYear()} · ${shortDate(start)} a ${shortDate(end)}`,
      };
    }
    case "quinzenal": {
      let start: Date, end: Date;
      if (d <= 15) {
        start = new Date(y, m, 1);
        end = new Date(y, m, 15);
      } else {
        start = new Date(y, m, 16);
        end = new Date(y, m + 1, 0);
      }
      return {
        start,
        end,
        key: `q-${start.toISOString().slice(0, 10)}`,
        label: `${d <= 15 ? "1ª" : "2ª"} quinzena de ${monthName(m)}/${y} · ${shortDate(start)} a ${shortDate(end)}`,
      };
    }
    case "mensal": {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return {
        start,
        end,
        key: `m-${y}-${m}`,
        label: `${monthName(m)}/${y}`,
      };
    }
    case "trimestral": {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 0);
      return {
        start,
        end,
        key: `t-${y}-${q}`,
        label: `${q + 1}º trimestre/${y}`,
      };
    }
    case "semestral": {
      const s = m < 6 ? 0 : 1;
      const start = new Date(y, s * 6, 1);
      const end = new Date(y, s * 6 + 6, 0);
      return {
        start,
        end,
        key: `sem-${y}-${s}`,
        label: `${s + 1}º semestre/${y}`,
      };
    }
    case "anual": {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31);
      return {
        start,
        end,
        key: `a-${y}`,
        label: `${y}`,
      };
    }
  }
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}
