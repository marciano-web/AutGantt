import { createClient } from "@/lib/supabase/server";
import { ReportsClient } from "./client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("*, demand_types(nome)")
    .order("created_at", { ascending: false });

  const selectedIds = ids ? ids.split(",").filter(Boolean) : [];

  let report = null;
  if (selectedIds.length > 0) {
    const [{ data: selProjects }, { data: stages }, { data: real }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("*, demand_types(nome)")
          .in("id", selectedIds),
        supabase
          .from("project_stages")
          .select("*, profiles(full_name)")
          .in("project_id", selectedIds)
          .order("ordem"),
        supabase
          .from("v_stage_real")
          .select("*")
          .in("project_id", selectedIds),
      ]);
    report = {
      projects: selProjects ?? [],
      stages: stages ?? [],
      real: real ?? [],
    };
  }

  return (
    <ReportsClient
      projects={(projects as never) ?? []}
      report={report as never}
      preselected={selectedIds}
    />
  );
}
