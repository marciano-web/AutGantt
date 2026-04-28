import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectDetailClient } from "./client";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const meId = u.user?.id ?? "";

  const [
    { data: project },
    { data: stages },
    { data: profiles },
    { data: cost },
    { data: real },
    { data: entries },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*, demand_types(nome)")
      .eq("id", id)
      .single(),
    supabase
      .from("project_stages")
      .select("*, profiles(full_name)")
      .eq("project_id", id)
      .order("ordem"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("v_project_costs")
      .select("*")
      .eq("project_id", id)
      .maybeSingle(),
    supabase.from("v_stage_real").select("*").eq("project_id", id),
    supabase
      .from("time_entries")
      .select("*, profiles(full_name)")
      .in(
        "stage_id",
        ((await supabase
          .from("project_stages")
          .select("id")
          .eq("project_id", id)).data ?? []).map((s) => s.id),
      )
      .order("started_at", { ascending: false }),
  ]);

  if (!project) notFound();

  return (
    <ProjectDetailClient
      project={project}
      stages={stages ?? []}
      profiles={profiles ?? []}
      cost={cost ?? null}
      real={real ?? []}
      entries={(entries as never) ?? []}
      meId={meId}
    />
  );
}
