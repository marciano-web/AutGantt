import { createClient } from "@/lib/supabase/server";
import { ReportsClient } from "./client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projects },
    { data: users },
    { data: allStages },
    { data: allReal },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*, demand_types(nome)")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("project_stages")
      .select("*, projects(nome), profiles(full_name)")
      .order("start_date"),
    supabase.from("v_stage_real").select("*"),
  ]);

  const selectedIds = ids ? ids.split(",").filter(Boolean) : [];

  let report = null;
  if (selectedIds.length > 0) {
    const selProjects = (projects ?? []).filter((p) =>
      selectedIds.includes(p.id),
    );
    const stages = (allStages ?? []).filter((s) =>
      selectedIds.includes(s.project_id as string),
    );
    const real = (allReal ?? []).filter((r) =>
      selectedIds.includes(r.project_id as string),
    );
    report = { projects: selProjects, stages, real };
  }

  return (
    <ReportsClient
      projects={(projects as never) ?? []}
      users={users ?? []}
      allStages={(allStages as never) ?? []}
      allReal={(allReal as never) ?? []}
      report={report as never}
      preselected={selectedIds}
    />
  );
}
