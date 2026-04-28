"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const HOURS_PER_DAY = 8;

function isWeekend(d: Date) {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function nextBusinessDay(d: Date) {
  const r = new Date(d);
  while (isWeekend(r)) r.setDate(r.getDate() + 1);
  return r;
}

function addBusinessDays(start: Date, count: number) {
  const r = new Date(start);
  while (isWeekend(r)) r.setDate(r.getDate() + 1);
  let added = 0;
  while (added < count - 1) {
    r.setDate(r.getDate() + 1);
    if (!isWeekend(r)) added++;
  }
  return r;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

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

  // Auto-agendamento: 8h/dia, dias úteis, etapas em sequência.
  // dias = ceil(horas / 8); cada etapa começa no próximo dia útil após a anterior.
  const initialIso = start_date ?? toISO(new Date());
  let cursor = nextBusinessDay(new Date(initialIso + "T00:00:00"));
  const stages = filtered.map((t, idx) => {
    const horas = Number(t.horas_default ?? 0);
    const days = Math.max(1, Math.ceil(horas / HOURS_PER_DAY));
    const start = new Date(cursor);
    const end = addBusinessDays(start, days);
    // próxima etapa: próximo dia útil após o fim
    const next = new Date(end);
    next.setDate(next.getDate() + 1);
    cursor = nextBusinessDay(next);
    return {
      project_id: project.id,
      stage_template_id: t.id,
      ordem: idx + 1,
      nome: t.nome,
      start_date: toISO(start),
      end_date: toISO(end),
      horas_estimadas: horas,
      status: "planejado" as const,
      progresso: 0,
    };
  });

  if (stages.length > 0) {
    const { error: stErr } = await supabase.from("project_stages").insert(stages);
    if (stErr) return { error: stErr.message };
    // Atualiza janela do projeto com a data final
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

function diffDays(a: string, b: string) {
  // calendar days between a and b (b - a)
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

function shiftIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export type CascadeMode = "self" | "project" | "global";

export async function moveStageDatesCascade(
  id: string,
  newStart: string,
  newEnd: string,
  mode: CascadeMode,
) {
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("project_stages")
    .select("id, project_id, ordem, start_date, end_date")
    .eq("id", id)
    .single();
  if (!cur) return { error: "Etapa não encontrada" };

  const startDelta = diffDays(cur.start_date as string, newStart);

  // 1) Atualiza a propria etapa
  const { error: e0 } = await supabase
    .from("project_stages")
    .update({ start_date: newStart, end_date: newEnd })
    .eq("id", id);
  if (e0) return { error: e0.message };

  if (mode !== "self" && startDelta !== 0) {
    if (mode === "project") {
      // todas as etapas do MESMO projeto com ordem > current.ordem
      const { data: rest } = await supabase
        .from("project_stages")
        .select("id, start_date, end_date, ordem")
        .eq("project_id", cur.project_id)
        .gt("ordem", cur.ordem as number);
      for (const s of rest ?? []) {
        await supabase
          .from("project_stages")
          .update({
            start_date: shiftIso(s.start_date as string, startDelta),
            end_date: shiftIso(s.end_date as string, startDelta),
          })
          .eq("id", s.id);
      }
    } else if (mode === "global") {
      // etapas em qualquer projeto cuja start_date >= start_date original (excluindo a propria)
      const { data: rest } = await supabase
        .from("project_stages")
        .select("id, start_date, end_date")
        .gte("start_date", cur.start_date as string)
        .neq("id", id);
      for (const s of rest ?? []) {
        await supabase
          .from("project_stages")
          .update({
            start_date: shiftIso(s.start_date as string, startDelta),
            end_date: shiftIso(s.end_date as string, startDelta),
          })
          .eq("id", s.id);
      }
    }
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${cur.project_id}`);
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true, delta: startDelta };
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
