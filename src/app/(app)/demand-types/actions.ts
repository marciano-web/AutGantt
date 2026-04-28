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
