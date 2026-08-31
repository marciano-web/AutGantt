import { isBusinessDay } from "@/lib/holidays";

type StageForLoad = {
  assignee_id: string | null;
  start_date: string;
  end_date: string;
  horas_estimadas: number | null;
  status: string;
};

export type DailyLoadRow = {
  assignee_id: string;
  dia: string;
  horas_dia: number;
};

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Calcula carga planejada diária a partir das etapas, distribuindo
 * `horas_estimadas` igualmente entre os dias úteis em [start_date, end_date].
 *
 * **Exclui** etapas com status "concluido" ou "cancelado" — só conta o que
 * o usuário ainda vai trabalhar (em_andamento + planejado).
 *
 * Substitui a view Postgres `v_user_daily_planned` que não tinha esse filtro.
 * Retorna múltiplas linhas por (user, dia) — uma por etapa que cai nesse dia,
 * mantendo compatibilidade com o consumo existente que agrega depois.
 */
export function computeDailyPlanned(stages: StageForLoad[]): DailyLoadRow[] {
  const out: DailyLoadRow[] = [];
  for (const s of stages) {
    if (!s.assignee_id) continue;
    if (s.status === "concluido" || s.status === "cancelado") continue;
    const horas = Number(s.horas_estimadas ?? 0);
    if (!(horas > 0)) continue;

    const days: string[] = [];
    const cur = new Date(s.start_date + "T00:00:00");
    const end = new Date(s.end_date + "T00:00:00");
    while (cur <= end) {
      if (isBusinessDay(cur)) days.push(toIso(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (days.length === 0) continue;
    const perDay = horas / days.length;
    for (const d of days) {
      out.push({
        assignee_id: s.assignee_id,
        dia: d,
        horas_dia: perDay,
      });
    }
  }
  return out;
}
