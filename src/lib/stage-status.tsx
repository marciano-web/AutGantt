import type { ProjectStage } from "@/lib/types";

export type DerivedStatus =
  | "planejado"
  | "em_andamento"
  | "concluido"
  | "cancelado"
  | "atrasado";

export function deriveStageStatus(
  stage: Pick<ProjectStage, "status" | "end_date">,
  hasTimeLogged: boolean,
): DerivedStatus {
  if (stage.status === "concluido" || stage.status === "cancelado") {
    return stage.status;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(stage.end_date + "T00:00:00");
  if (end < today) return "atrasado";
  if (hasTimeLogged) return "em_andamento";
  return stage.status;
}

export const statusLabel: Record<DerivedStatus, string> = {
  planejado: "Planejado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  atrasado: "Atrasado",
};

export const statusClass: Record<DerivedStatus, string> = {
  planejado: "bg-muted text-muted-foreground",
  em_andamento: "bg-primary/10 text-primary",
  concluido: "bg-success/10 text-success",
  cancelado: "bg-muted text-muted-foreground line-through",
  atrasado: "bg-danger/10 text-danger font-medium",
};

export function StatusPill({ status }: { status: DerivedStatus }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${statusClass[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}
