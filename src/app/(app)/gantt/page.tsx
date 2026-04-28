import { createClient } from "@/lib/supabase/server";
import { GlobalGanttClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("project_stages")
    .select("*, projects(nome), profiles(full_name)")
    .order("start_date");
  return <GlobalGanttClient stages={(stages as any) ?? []} />;
}
