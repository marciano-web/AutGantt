"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const nome = String(formData.get("nome") ?? "").trim();
  const cliente = String(formData.get("cliente") ?? "").trim() || null;
  const demand_type_id = String(formData.get("demand_type_id") ?? "");
  const start_date = String(formData.get("start_date") ?? "") || null;
  if (!nome || !demand_type_id)
    return { error: "Nome e tipo são obrigatórios" };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ nome, cliente, demand_type_id, start_date, status: "planejado" })
    .select("*")
    .single();
  if (error || !project) return { error: error?.message ?? "Erro ao criar" };

  // Copia stage_templates → project_stages SEM datas (usuário define depois)
  const { data: tpls } = await supabase
    .from("stage_templates")
    .select("*")
    .eq("demand_type_id", demand_type_id)
    .order("ordem");

  const placeholder = start_date ?? new Date().toISOString().slice(0, 10);
  const stages = (tpls ?? []).map((t) => ({
    project_id: project.id,
    stage_template_id: t.id,
    ordem: t.ordem,
    nome: t.nome,
    start_date: placeholder,
    end_date: placeholder,
    horas_estimadas: t.horas_default,
    status: "planejado" as const,
    progresso: 0,
  }));

  if (stages.length > 0) {
    const { error: stErr } = await supabase.from("project_stages").insert(stages);
    if (stErr) return { error: stErr.message };
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

  // Recalcula janela do projeto a partir do min/max das etapas
  const { data: stages } = await supabase
    .from("project_stages")
    .select("start_date, end_date")
    .eq("project_id", projectId);
  if (stages && stages.length > 0) {
    let min = stages[0].start_date;
    let max = stages[0].end_date;
    for (const s of stages) {
      if (s.start_date < min) min = s.start_date;
      if (s.end_date > max) max = s.end_date;
    }
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

// === Time tracking ===

export async function startTimer(stageId: string) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { error: "Não autenticado" };

  // Para qualquer timer rodando do mesmo user (mesmo que em outra etapa)
  await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("ended_at", null);

  const { error } = await supabase.from("time_entries").insert({
    stage_id: stageId,
    user_id: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects`, "layout");
  return { ok: true };
}

export async function stopTimer(stageId: string) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("stage_id", stageId)
    .is("ended_at", null);
  if (error) return { error: error.message };

  revalidatePath(`/projects`, "layout");
  return { ok: true };
}

export async function deleteTimeEntry(entryId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(`/projects`, "layout");
  return { ok: true };
}
