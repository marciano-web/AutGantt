"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { deriveStageStatus } from "@/lib/stage-status";
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

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gantt Geral</h1>
        <p className="text-sm text-muted-foreground">
          Todas as etapas de todos os projetos. Edite datas, controle o timer,
          finalize ou exclua direto da grade.
        </p>
      </div>

      <Card>
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
    </div>
  );
}
