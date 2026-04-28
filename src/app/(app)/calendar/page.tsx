import { createClient } from "@/lib/supabase/server";
import { CalendarClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: load }, { data: stages }] = await Promise.all(
    [
      supabase
        .from("profiles")
        .select("id, full_name, jornada_diaria_h, is_active")
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("v_user_daily_load").select("*"),
      supabase
        .from("project_stages")
        .select("*, projects(nome), profiles(full_name)")
        .order("start_date"),
    ],
  );
  return (
    <CalendarClient
      profiles={profiles ?? []}
      load={load ?? []}
      stages={(stages as any) ?? []}
    />
  );
}
