import { createClient } from "@/lib/supabase/server";
import { DemandTypesClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: types }, { data: templates }, { data: profile }] = await Promise.all([
    supabase.from("demand_types").select("*").order("nome"),
    supabase.from("stage_templates").select("*").order("ordem"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single(),
  ]);
  return (
    <DemandTypesClient
      types={types ?? []}
      templates={templates ?? []}
      isAdmin={profile?.role === "admin"}
    />
  );
}
