"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PrintButton } from "@/components/print-button";
import { StatusPill, deriveStageStatus, statusLabel, type DerivedStatus } from "@/lib/stage-status";
import { brl, fmtDate } from "@/lib/utils";
import type {
  ProjectStage,
  StageRealView,
  TimeEntry,
} from "@/lib/types";

const ProjectGantt = dynamic(() => import("@/components/project-gantt"), {
  ssr: false,
});

type Row = ProjectStage & {
  projects: { nome: string } | null;
  profiles: { full_name: string } | null;
};

type ProjectOpt = { id: string; nome: string };
type UserOpt = { id: string; full_name: string; email: string | null };

const STATUS_OPTS = [
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "atrasado", label: "Atrasado (derivado)" },
];

export function GlobalGanttClient({
  stages,
  real,
  entries,
  projects,
  users,
  meId,
}: {
  stages: Row[];
  real: StageRealView[];
  entries: TimeEntry[];
  projects: ProjectOpt[];
  users: UserOpt[];
  meId: string;
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
    () => new Map(real.map((r) => [r.stage_id, r])),
    [real],
  );

  const filtered = useMemo(() => {
    return stages.filter((s) => {
      if (!projectIds.has(s.project_id)) return false;
      const userKey = s.assignee_id ?? "__none__";
      if (!userIds.has(userKey)) return false;
      const r = realByStage.get(s.id);
      const derived = deriveStageStatus(s, Number(r?.horas_reais ?? 0) > 0);
      if (!statuses.has(derived)) return false;
      if (dateFrom && s.end_date < dateFrom) return false;
      if (dateTo && s.start_date > dateTo) return false;
      return true;
    });
  }, [stages, projectIds, userIds, statuses, dateFrom, dateTo, realByStage]);

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
  const totC = filtered.reduce(
    (a, s) => a + Number(realByStage.get(s.id)?.custo_real ?? 0),
    0,
  );
  const totEst = filtered.reduce(
    (a, s) => a + Number(s.horas_estimadas ?? 0),
    0,
  );

  const filterSummary = buildFilterSummary({
    projectOpts,
    userOpts,
    projectIds,
    userIds,
    statuses,
    dateFrom,
    dateTo,
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gantt Geral</h1>
          <p className="text-sm text-muted-foreground">
            Todas as etapas de todos os projetos. Edite datas, controle o timer,
            finalize ou exclua direto da grade.
          </p>
        </div>
        <PrintButton label="Exportar PDF" />
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <MultiSelect
              label="Demandas"
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

      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-semibold">AutGantt — Gantt Geral</h1>
        <p className="text-xs text-gray-600">
          {filtered.length} etapa(s) · {projectsInFilter} projeto(s) · Gerado em{" "}
          {new Date().toLocaleString("pt-BR")}
        </p>
        {filterSummary.length > 0 && (
          <ul className="text-[10pt] text-gray-700 mt-1 grid gap-0.5">
            {filterSummary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-4 gap-2 mt-3 text-[10pt]">
          <PrintStat label="Etapas" value={String(filtered.length)} />
          <PrintStat label="Projetos" value={String(projectsInFilter)} />
          <PrintStat
            label="Horas reais / est."
            value={`${totH.toFixed(1)} / ${totEst.toFixed(1)} h`}
          />
          <PrintStat label="Custo real" value={brl(totC)} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} etapa(s) · {projectsInFilter} projeto(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ProjectGantt
            stages={filtered}
            real={real}
            entries={entries}
            meId={meId}
            groupByProject
          />
        </CardContent>
      </Card>

      <Card className="hidden print:block">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Etapas</CardTitle>
          <CardDescription>
            Detalhamento das etapas filtradas.
          </CardDescription>
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
    </div>
  );
}

function PrintStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-300 rounded px-2 py-1">
      <div className="text-[8pt] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function buildFilterSummary({
  projectOpts,
  userOpts,
  projectIds,
  userIds,
  statuses,
  dateFrom,
  dateTo,
}: {
  projectOpts: { value: string; label: string }[];
  userOpts: { value: string; label: string }[];
  projectIds: Set<string>;
  userIds: Set<string>;
  statuses: Set<string>;
  dateFrom: string;
  dateTo: string;
}): string[] {
  const lines: string[] = [];
  if (projectIds.size < projectOpts.length) {
    const names = projectOpts
      .filter((o) => projectIds.has(o.value))
      .map((o) => o.label);
    lines.push(
      `Demandas (${names.length}/${projectOpts.length}): ${names.join(", ") || "—"}`,
    );
  }
  if (userIds.size < userOpts.length) {
    const names = userOpts
      .filter((o) => userIds.has(o.value))
      .map((o) => o.label);
    lines.push(
      `Usuários (${names.length}/${userOpts.length}): ${names.join(", ") || "—"}`,
    );
  }
  if (statuses.size < STATUS_OPTS.length) {
    const names = STATUS_OPTS.filter((o) => statuses.has(o.value)).map(
      (o) => statusLabel[o.value as DerivedStatus] ?? o.label,
    );
    lines.push(`Status: ${names.join(", ") || "—"}`);
  }
  if (dateFrom || dateTo) {
    lines.push(
      `Período: ${dateFrom ? fmtDate(dateFrom) : "…"} → ${dateTo ? fmtDate(dateTo) : "…"}`,
    );
  }
  return lines;
}
