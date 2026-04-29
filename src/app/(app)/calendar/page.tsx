import { createClient } from "@/lib/supabase/server";
import { CalendarClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const [
    { data: profiles },
    { data: planned },
    { data: real },
    { data: stages },
    { data: projects },
    { data: realByStage },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, jornada_diaria_h, is_active, email")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("v_user_daily_planned").select("*"),
    supabase.from("v_user_daily_real").select("*"),
    supabase
      .from("project_stages")
      .select("*, projects(nome), profiles(full_name)")
      .order("start_date"),
    supabase.from("projects").select("id, nome").order("nome"),
    supabase.from("v_stage_real").select("*"),
  ]);
  return (
    <CalendarClient
      profiles={profiles ?? []}
      planned={planned ?? []}
      real={real ?? []}
      stages={(stages as never) ?? []}
      projects={projects ?? []}
      realByStage={(realByStage as never) ?? []}
    />
  );
}
