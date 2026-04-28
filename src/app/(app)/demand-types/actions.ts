"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDemandType(formData: FormData) {
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  if (!nome) return { error: "Nome obrigatório" };
  const { error } = await supabase
    .from("demand_types")
    .insert({ nome, descricao });
  if (error) return { error: error.message };
  revalidatePath("/demand-types");
  return { ok: true };
}

export async function updateDemandType(id: string, formData: FormData) {
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const { error } = await supabase
    .from("demand_types")
    .update({ nome, descricao })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/demand-types");
  return { ok: true };
}

export async function deleteDemandType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("demand_types").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/demand-types");
  return { ok: true };
}

export async function upsertStageTemplate(formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const payload = {
    demand_type_id: String(formData.get("demand_type_id")),
    nome: String(formData.get("nome") ?? "").trim(),
    ordem: Number(formData.get("ordem") ?? 1),
    horas_default: Number(formData.get("horas_default") ?? 0),
  };
  if (!payload.nome) return { error: "Nome obrigatório" };
  const { error } = id
    ? await supabase.from("stage_templates").update(payload).eq("id", id)
    : await supabase.from("stage_templates").insert(payload);
  if (error) return { error: error.message };
  revalidatePath("/demand-types");
  return { ok: true };
}

export async function deleteStageTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("stage_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/demand-types");
  return { ok: true };
}

export async function moveStageTemplate(
  id: string,
  direction: "up" | "down",
) {
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("stage_templates")
    .select("id, ordem, demand_type_id")
    .eq("id", id)
    .single();
  if (!cur) return { error: "Etapa não encontrada" };

  const targetOrdem = direction === "up" ? cur.ordem - 1 : cur.ordem + 1;
  const { data: neighbor } = await supabase
    .from("stage_templates")
    .select("id, ordem")
    .eq("demand_type_id", cur.demand_type_id)
    .eq("ordem", targetOrdem)
    .maybeSingle();
  if (!neighbor) return { ok: true }; // já no limite

  // Swap usando ordem temporariamente negativo para nao violar unique(demand_type_id, ordem)
  const park = -1 * (cur.ordem + 1000);
  const { error: e1 } = await supabase
    .from("stage_templates")
    .update({ ordem: park })
    .eq("id", cur.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("stage_templates")
    .update({ ordem: cur.ordem })
    .eq("id", neighbor.id);
  if (e2) return { error: e2.message };
  const { error: e3 } = await supabase
    .from("stage_templates")
    .update({ ordem: targetOrdem })
    .eq("id", cur.id);
  if (e3) return { error: e3.message };

  revalidatePath("/demand-types");
  return { ok: true };
}

export async function renumberStageTemplates(demandTypeId: string) {
  const supabase = await createClient();
  const { data: tpls } = await supabase
    .from("stage_templates")
    .select("id, ordem")
    .eq("demand_type_id", demandTypeId)
    .order("ordem");
  if (!tpls || tpls.length === 0) return { ok: true as const };

  for (const [i, t] of tpls.entries()) {
    const { error } = await supabase
      .from("stage_templates")
      .update({ ordem: -1 * (i + 1) - 1000 })
      .eq("id", t.id);
    if (error) return { error: error.message };
  }
  for (const [i, t] of tpls.entries()) {
    const { error } = await supabase
      .from("stage_templates")
      .update({ ordem: i + 1 })
      .eq("id", t.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/demand-types");
  return { ok: true as const };
}
