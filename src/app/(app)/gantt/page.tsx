import { createClient } from "@/lib/supabase/server";
import { GlobalGanttClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const meId = u.user?.id ?? "";

  const [
    { data: stages },
    { data: real },
    { data: entries },
    { data: projects },
    { data: users },
  ] = await Promise.all([
    supabase
      .from("project_stages")
      .select("*, projects(nome), profiles(full_name)")
      .order("start_date"),
    supabase.from("v_stage_real").select("*"),
    supabase.from("time_entries").select("*").is("ended_at", null),
    supabase.from("projects").select("id, nome").order("nome"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
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
