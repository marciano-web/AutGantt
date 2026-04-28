"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function nextBusinessDay(d: Date) {
  const r = new Date(d);
  while (r.getDay() === 0 || r.getDay() === 6) {
    r.setDate(r.getDate() + 1);
  }
  return r;
}

function addBusinessDays(d: Date, n: number) {
  const r = new Date(d);
  let added = 0;
  while (added < n - 1) {
    r.setDate(r.getDate() + 1);
    if (r.getDay() !== 0 && r.getDay() !== 6) added++;
  }
  return r;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim();
  const cliente = String(formData.get("cliente") ?? "").trim() || null;
  const demand_type_id = String(formData.get("demand_type_id") ?? "");
  const start_date = String(formData.get("start_date") ?? "");
  if (!nome || !demand_type_id || !start_date)
    return { error: "Nome, tipo e data inicial são obrigatórios" };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ nome, cliente, demand_type_id, start_date, status: "planejado" })
    .select("*")
    .single();
  if (error || !project) return { error: error?.message ?? "Erro ao criar" };

  // copia stage_templates → project_stages, sequenciando datas em dias úteis
  const { data: tpls } = await supabase
    .from("stage_templates")
    .select("*")
    .eq("demand_type_id", demand_type_id)
    .order("ordem");

  let cursor = nextBusinessDay(new Date(start_date + "T00:00:00"));
  const stages = (tpls ?? []).map((t) => {
    const start = new Date(cursor);
    const end = addBusinessDays(start, t.duracao_dias_default || 1);
    const next = new Date(end);
    next.setDate(next.getDate() + 1);
    cursor = nextBusinessDay(next);
    return {
      project_id: project.id,
      stage_template_id: t.id,
      ordem: t.ordem,
      nome: t.nome,
      start_date: toISO(start),
      end_date: toISO(end),
      horas_estimadas: t.horas_default,
      custo_fixo: t.custo_fixo_default,
      status: "planejado" as const,
      progresso: 0,
    };
  });

  if (stages.length > 0) {
    const { error: stErr } = await supabase.from("project_stages").insert(stages);
    if (stErr) return { error: stErr.message };
    // atualiza end_date do projeto
    const lastEnd = stages.at(-1)!.end_date;
    await supabase
      .from("projects")
      .update({ end_date: lastEnd })
      .eq("id", project.id);
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    nome: String(formData.get("nome") ?? "").trim(),
    cliente: String(formData.get("cliente") ?? "").trim() || null,
    status: String(formData.get("status") ?? "planejado"),
  };
  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/projects");
  redirect("/projects");
}

export async function upsertStage(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const id = (formData.get("id") as string) || null;
  const payload = {
    project_id: projectId,
    nome: String(formData.get("nome") ?? "").trim(),
    ordem: Number(formData.get("ordem") ?? 1),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    horas_estimadas: Number(formData.get("horas_estimadas") ?? 0),
    horas_realizadas: Number(formData.get("horas_realizadas") ?? 0),
    custo_fixo: Number(formData.get("custo_fixo") ?? 0),
    assignee_id: (formData.get("assignee_id") as string) || null,
    status: String(formData.get("status") ?? "planejado") as
      | "planejado"
      | "em_andamento"
      | "concluido"
      | "cancelado",
    progresso: Number(formData.get("progresso") ?? 0),
  };
  if (!payload.nome || !payload.start_date || !payload.end_date)
    return { error: "Nome e datas são obrigatórios" };

  const { error } = id
    ? await supabase.from("project_stages").update(payload).eq("id", id)
    : await supabase.from("project_stages").insert(payload);
  if (error) return { error: error.message };

  // recalcula end_date do projeto
  const { data: stages } = await supabase
    .from("project_stages")
    .select("end_date")
    .eq("project_id", projectId);
  if (stages && stages.length > 0) {
    const max = stages.reduce(
      (a, s) => (s.end_date > a ? s.end_date : a),
      stages[0].end_date,
    );
    const min = stages.reduce(
      (a, s) => (s.end_date < a ? s.end_date : a),
      stages[0].end_date,
    );
    await supabase
      .from("projects")
      .update({ start_date: min, end_date: max })
      .eq("id", projectId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteStage(projectId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_stages").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function moveStageDates(
  id: string,
  start_date: string,
  end_date: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_stages")
    .update({ start_date, end_date })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true };
}
