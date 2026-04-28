"use client";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function GlobalGanttClient({
  stages,
  real,
  entries,
  meId,
}: {
  stages: Row[];
  real: StageRealView[];
  entries: TimeEntry[];
  meId: string;
}) {
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
        <CardHeader>
          <CardTitle className="text-base">{stages.length} etapa(s)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ProjectGantt
            stages={stages}
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
