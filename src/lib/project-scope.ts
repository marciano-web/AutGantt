import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retorna lista de project_ids visíveis para o usuário autenticado.
 * Se can_view_all_projects = true (ou admin), retorna null → sem filtro.
 * Se false, retorna array de ids dos projetos onde o usuário é assignee.
 */
export async function visibleProjectIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[] | null> {
  const { data: me } = await supabase
    .from("profiles")
    .select("role, can_view_all_projects")
    .eq("id", userId)
    .single();

  if (!me) return null;
  if (me.role === "admin" || me.can_view_all_projects) return null;

  const { data: stages } = await supabase
    .from("project_stages")
    .select("project_id")
    .eq("assignee_id", userId);

  return [...new Set((stages ?? []).map((s) => s.project_id as string))];
}
