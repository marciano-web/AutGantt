import { createClient } from "@/lib/supabase/server";
import { GlobalGanttClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const meId = u.user?.id ?? "";

  const [{ data: stages }, { data: real }, { data: entries }] = await Promise.all([
    supabase
      .from("project_stages")
      .select("*, projects(nome), profiles(full_name)")
      .order("start_date"),
    supabase.from("v_stage_real").select("*"),
    supabase
      .from("time_entries")
      .select("*")
      .is("ended_at", null),
  ]);

  return (
    <GlobalGanttClient
      stages={(stages as never) ?? []}
      real={(real as never) ?? []}
      entries={(entries as never) ?? []}
      meId={meId}
    />
  );
}
