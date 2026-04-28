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
  const templateIdsRaw = String(formData.get("template_ids") ?? "");
  const selectedTemplateIds = templateIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!nome || !demand_type_id)
    return { error: "Nome e tipo são obrigatórios" };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ nome, cliente, demand_type_id, start_date, status: "planejado" })
    .select("*")
    .single();
  if (error || !project) return { error: error?.message ?? "Erro ao criar" };

  // Pega só as etapas-padrão selecionadas, na ordem original
  const { data: tpls } = await supabase
    .from("stage_templates")
    .select("*")
    .eq("demand_type_id", demand_type_id)
    .order("ordem");

  const filtered =
    selectedTemplateIds.length > 0
      ? (tpls ?? []).filter((t) => selectedTemplateIds.includes(t.id))
      : (tpls ?? []);

  // Renumera 1..N em sequência (mantém ordem original mas reseta os números)
  const placeholder = start_date ?? new Date().toISOString().slice(0, 10);
  const stages = filtered.map((t, idx) => ({
    project_id: project.id,
    stage_template_id: t.id,
    ordem: idx + 1,
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

export async function finalizeStage(stageId: string, projectId: string) {
  const supabase = await createClient();
  // Para qualquer timer rodando nesta etapa antes de finalizar
  await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("stage_id", stageId)
    .is("ended_at", null);

  const { error } = await supabase
    .from("project_stages")
    .update({ status: "concluido", progresso: 100 })
    .eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function reopenStage(stageId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_stages")
    .update({ status: "em_andamento" })
    .eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function finalizeProject(projectId: string) {
  const supabase = await createClient();
  // Encerra qualquer timer rodando em etapas deste projeto
  const { data: stagesIds } = await supabase
    .from("project_stages")
    .select("id")
    .eq("project_id", projectId);
  if (stagesIds && stagesIds.length > 0) {
    await supabase
      .from("time_entries")
      .update({ ended_at: new Date().toISOString() })
      .in(
        "stage_id",
        stagesIds.map((s) => s.id),
      )
      .is("ended_at", null);
  }
  await supabase
    .from("project_stages")
    .update({ status: "concluido" })
    .eq("project_id", projectId)
    .not("status", "in", "(concluido,cancelado)");
  const { error } = await supabase
    .from("projects")
    .update({ status: "concluido" })
    .eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/gantt");
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
