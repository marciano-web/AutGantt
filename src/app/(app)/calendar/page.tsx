import { createClient } from "@/lib/supabase/server";
import { computeDailyPlanned } from "@/lib/load";
import { CalendarClient } from "./client";
import { visibleProjectIds } from "@/lib/project-scope";

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const meId = u.user?.id ?? "";
  const scope = await visibleProjectIds(supabase, meId);

  let stagesQuery = supabase
    .from("project_stages")
    .select("*, projects(nome), profiles(full_name)")
    .order("start_date");
  if (scope !== null) stagesQuery = stagesQuery.in("project_id", scope.length ? scope : ["__none__"]);

  let projectsQuery = supabase.from("projects").select("id, nome").order("nome");
  if (scope !== null) projectsQuery = projectsQuery.in("id", scope.length ? scope : ["__none__"]);

  const [
    { data: profiles },
    { data: real },
    { data: stages },
    { data: projects },
    { data: realByStage },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, jornada_diaria_h, is_active, email")
      .eq("is_active", true)
      .neq("role", "cliente")
      .order("full_name"),
    supabase.from("v_user_daily_real").select("*"),
    stagesQuery,
    projectsQuery,
    supabase.from("v_stage_real").select("*"),
  ]);

  // Carga planejada calculada em codigo (exclui concluido/cancelado)
  // — substitui a view v_user_daily_planned que nao tinha esse filtro.
  const planned = computeDailyPlanned(
    (stages ?? []).map((s) => ({
      assignee_id: s.assignee_id as string | null,
      start_date: s.start_date as string,
      end_date: s.end_date as string,
      horas_estimadas: s.horas_estimadas as number | null,
      status: s.status as string,
    })),
  );

  return (
    <CalendarClient
      profiles={profiles ?? []}
      planned={planned}
      real={real ?? []}
      stages={(stages as never) ?? []}
      projects={projects ?? []}
      realByStage={(realByStage as never) ?? []}
    />
  );
}
