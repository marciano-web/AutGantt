import { createClient } from "@/lib/supabase/server";
import { GlobalGanttClient } from "./client";
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
    { data: stages },
    { data: real },
    { data: entries },
    { data: projects },
    { data: users },
  ] = await Promise.all([
    stagesQuery,
    supabase.from("v_stage_real").select("*"),
    supabase.from("time_entries").select("*").is("ended_at", null),
    projectsQuery,
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .neq("role", "cliente")
      .order("full_name"),
  ]);

  return (
    <GlobalGanttClient
      stages={(stages as never) ?? []}
      real={(real as never) ?? []}
      entries={(entries as never) ?? []}
      projects={projects ?? []}
      users={users ?? []}
      meId={meId}
    />
  );
}
