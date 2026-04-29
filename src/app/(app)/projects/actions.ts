"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDay } from "@/lib/holidays";

const HOURS_PER_DAY = 8;

function nextBusinessDay(d: Date) {
  const r = new Date(d);
  while (!isBusinessDay(r)) r.setDate(r.getDate() + 1);
  return r;
}

function addBusinessDays(start: Date, count: number) {
  const r = new Date(start);
  while (!isBusinessDay(r)) r.setDate(r.getDate() + 1);
  let added = 0;
  while (added < count - 1) {
    r.setDate(r.getDate() + 1);
    if (isBusinessDay(r)) added++;
  }
  return r;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export type CapacityWarning = {
  user_id: string;
  full_name: string;
  jornada: number;
  days: Array<{ dia: string; horas: number; pct: number }>;
};

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
  const assigneesJson = String(formData.get("assignees") ?? "{}");
  let assignees: Record<string, string | null> = {};
  try {
    assignees = JSON.parse(assigneesJson);
  } catch {
    assignees = {};
  }

  if (!nome || !demand_type_id)
    return { error: "Nome e tipo são obrigatórios" };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ nome, cliente, demand_type_id, start_date, status: "planejado" })
    .select("*")
    .single();
  if (error || !project) return { error: error?.message ?? "Erro ao criar" };

  const { data: tpls } = await supabase
    .from("stage_templates")
    .select("*")
    .eq("demand_type_id", demand_type_id)
    .order("ordem");

  const filtered =
    selectedTemplateIds.length > 0
      ? (tpls ?? []).filter((t) => selectedTemplateIds.includes(t.id))
      : (tpls ?? []);

  const initialIso = start_date ?? toISO(new Date());
  let cursor = nextBusinessDay(new Date(initialIso + "T00:00:00"));
  const stages = filtered.map((t, idx) => {
    const horas = Number(t.horas_default ?? 0);
    const days = Math.max(1, Math.ceil(horas / HOURS_PER_DAY));
    const start = new Date(cursor);
    const end = addBusinessDays(start, days);
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
      assignee_id: assignees[t.id] || null,
      status: "planejado" as const,
      progresso: 0,
    };
  });

  if (stages.length > 0) {
    const { error: stErr } = await supabase.from("project_stages").insert(stages);
    if (stErr) return { error: stErr.message };
    const lastEnd = stages.at(-1)!.end_date;
    await supabase
      .from("projects")
      .update({ end_date: lastEnd })
      .eq("id", project.id);
  }

  // Checagem de capacidade: detecta dias > 100% jornada para os assignees deste projeto
  const warnings = await capacityWarningsForProject(supabase, project.id);

  revalidatePath("/projects");
  return { ok: true, projectId: project.id, warnings };
}

async function capacityWarningsForProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<CapacityWarning[]> {
  const { data: ps } = await supabase
    .from("project_stages")
    .select("assignee_id")
    .eq("project_id", projectId)
    .not("assignee_id", "is", null);
  const userIds = Array.from(
    new Set((ps ?? []).map((r: { assignee_id: string }) => r.assignee_id)),
  );
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, jornada_diaria_h")
    .in("id", userIds);
  const profById = new Map(
    (profiles ?? []).map(
      (p: { id: string; full_name: string; jornada_diaria_h: number }) => [
        p.id,
        p,
      ],
    ),
  );

  const { data: load } = await supabase
    .from("v_user_daily_planned")
    .select("*")
    .in("assignee_id", userIds);

  // Agrupa por usuario: dias com pct >= 100
  const byUser = new Map<
    string,
    { dia: string; horas: number; pct: number }[]
  >();
  for (const row of (load ?? []) as Array<{
    assignee_id: string;
    dia: string;
    horas_dia: number;
  }>) {
    const prof = profById.get(row.assignee_id) as
      | { jornada_diaria_h: number }
      | undefined;
    const j = Number(prof?.jornada_diaria_h ?? 8);
    const h = Number(row.horas_dia ?? 0);
    const pct = j > 0 ? h / j : 0;
    // Sobrecarga real: estritamente > 100% (100% cheio mas dentro da jornada nao alerta)
    if (pct > 1.0001) {
      const arr = byUser.get(row.assignee_id) ?? [];
      arr.push({ dia: String(row.dia), horas: h, pct });
      byUser.set(row.assignee_id, arr);
    }
  }

  const out: CapacityWarning[] = [];
  for (const [userId, days] of byUser) {
    const prof = profById.get(userId) as
      | { full_name: string; jornada_diaria_h: number }
      | undefined;
    if (!prof) continue;
    out.push({
      user_id: userId,
      full_name: prof.full_name,
      jornada: Number(prof.jornada_diaria_h),
      days: days.sort((a, b) => a.dia.localeCompare(b.dia)),
    });
  }
  return out;
}

function isOccupied(
  d: Date,
  intervals: { start: Date; end: Date }[],
): boolean {
  const t = d.getTime();
  for (const iv of intervals) {
    if (t >= iv.start.getTime() && t <= iv.end.getTime()) return true;
  }
  return false;
}

export async function rescheduleProjectByCapacity(projectId: string) {
  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("project_stages")
    .select(
      "id, ordem, nome, start_date, end_date, horas_estimadas, assignee_id, status, progresso, stage_template_id",
    )
    .eq("project_id", projectId)
    .order("ordem");
  if (!stages) return { error: "Projeto sem etapas" };

  // Janela inicial = data mínima atual
  const projectStart = stages.reduce(
    (a, s) => ((s.start_date as string) < a ? (s.start_date as string) : a),
    stages[0]?.start_date as string,
  );

  // Coleta etapas existentes em OUTROS projetos pra cada user
  const userIds = Array.from(
    new Set(
      stages
        .map((s) => s.assignee_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const occupied: Record<string, { start: Date; end: Date }[]> = {};
  if (userIds.length > 0) {
    const { data: other } = await supabase
      .from("project_stages")
      .select("assignee_id, start_date, end_date")
      .in("assignee_id", userIds)
      .neq("project_id", projectId);
    for (const o of other ?? []) {
      const uid = o.assignee_id as string;
      if (!occupied[uid]) occupied[uid] = [];
      occupied[uid].push({
        start: new Date((o.start_date as string) + "T00:00:00"),
        end: new Date((o.end_date as string) + "T00:00:00"),
      });
    }
  }
  for (const uid of userIds) {
    if (!occupied[uid]) occupied[uid] = [];
  }

  const userCursors: Record<string, Date> = {};

  type StageUpdate = {
    id: string;
    nome: string;
    ordem: number;
    start_date: string;
    end_date: string;
    horas_estimadas: number;
  };
  type StageInsert = {
    project_id: string;
    stage_template_id: string | null;
    assignee_id: string | null;
    nome: string;
    ordem: number;
    start_date: string;
    end_date: string;
    horas_estimadas: number;
    status: string;
    progresso: number;
  };

  const updates: StageUpdate[] = [];
  const inserts: StageInsert[] = [];
  let nextOrdem = 1;

  for (const s of stages) {
    if (!s.assignee_id) {
      // sem responsável: mantém datas e horas, só renumera
      updates.push({
        id: s.id as string,
        nome: s.nome as string,
        ordem: nextOrdem++,
        start_date: s.start_date as string,
        end_date: s.end_date as string,
        horas_estimadas: Number(s.horas_estimadas ?? 0),
      });
      continue;
    }

    const uid = s.assignee_id as string;
    const horas = Number(s.horas_estimadas ?? 0);
    const totalDays = Math.max(1, Math.ceil(horas / HOURS_PER_DAY));

    // ponto de partida: max(data atual da etapa, cursor do usuário, início do projeto)
    const startCandidate = new Date(
      (s.start_date as string) + "T00:00:00",
    );
    const projStart = new Date(projectStart + "T00:00:00");
    let cursor = nextBusinessDay(
      startCandidate < projStart ? projStart : startCandidate,
    );
    const userCursor = userCursors[uid];
    if (userCursor && userCursor > cursor) cursor = new Date(userCursor);

    // Empacotamento: vai colocando bloquinhos contíguos até completar totalDays
    type Part = { start: Date; end: Date; days: number };
    const parts: Part[] = [];
    let remaining = totalDays;

    while (remaining > 0) {
      // 1) avança até achar dia livre (não ocupado)
      let placeStart = nextBusinessDay(cursor);
      while (isOccupied(placeStart, occupied[uid])) {
        placeStart = new Date(placeStart);
        placeStart.setDate(placeStart.getDate() + 1);
        placeStart = nextBusinessDay(placeStart);
      }

      // 2) avança consecutivos enquanto livre, até completar remaining
      let placeEnd = new Date(placeStart);
      let daysPlaced = 1;
      while (daysPlaced < remaining) {
        const probe = new Date(placeEnd);
        probe.setDate(probe.getDate() + 1);
        const next = nextBusinessDay(probe);
        if (isOccupied(next, occupied[uid])) break;
        placeEnd = next;
        daysPlaced++;
      }

      parts.push({ start: placeStart, end: placeEnd, days: daysPlaced });

      // adiciona aos ocupados (para que próximas partes/etapas não pisem aqui)
      occupied[uid].push({ start: new Date(placeStart), end: new Date(placeEnd) });

      remaining -= daysPlaced;
      const after = new Date(placeEnd);
      after.setDate(after.getDate() + 1);
      cursor = nextBusinessDay(after);
    }

    userCursors[uid] = cursor;

    // Distribui horas proporcional aos dias de cada parte
    const totalDaysReal = parts.reduce((a, p) => a + p.days, 0) || 1;
    parts.forEach((part, i) => {
      const partHoras =
        Math.round(((horas * part.days) / totalDaysReal) * 100) / 100;
      const baseName = (s.nome as string).replace(/ \(parte \d+\/\d+\)$/, "");
      const nome =
        parts.length > 1
          ? `${baseName} (parte ${i + 1}/${parts.length})`
          : baseName;
      if (i === 0) {
        updates.push({
          id: s.id as string,
          nome,
          ordem: nextOrdem++,
          start_date: toISO(part.start),
          end_date: toISO(part.end),
          horas_estimadas: partHoras,
        });
      } else {
        inserts.push({
          project_id: projectId,
          stage_template_id: (s.stage_template_id as string | null) ?? null,
          assignee_id: uid,
          nome,
          ordem: nextOrdem++,
          start_date: toISO(part.start),
          end_date: toISO(part.end),
          horas_estimadas: partHoras,
          status: (s.status as string) ?? "planejado",
          progresso: 0,
        });
      }
    });
  }

  // Aplica updates (em duas passadas: ordem temporário negativo pra evitar colisão visual)
  // (project_stages.ordem não tem UNIQUE, mas faz update direto pra simplicidade)
  for (const u of updates) {
    const { error } = await supabase
      .from("project_stages")
      .update({
        nome: u.nome,
        ordem: u.ordem,
        start_date: u.start_date,
        end_date: u.end_date,
        horas_estimadas: u.horas_estimadas,
      })
      .eq("id", u.id);
    if (error) return { error: error.message };
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("project_stages").insert(inserts);
    if (error) return { error: error.message };
  }

  // janela do projeto
  let minStart = updates[0]?.start_date;
  let maxEnd = updates[0]?.end_date;
  for (const u of [...updates, ...inserts]) {
    if (!minStart || u.start_date < minStart) minStart = u.start_date;
    if (!maxEnd || u.end_date > maxEnd) maxEnd = u.end_date;
  }
  if (minStart && maxEnd) {
    await supabase
      .from("projects")
      .update({ start_date: minStart, end_date: maxEnd })
      .eq("id", projectId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true, splitsCreated: inserts.length };
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
  adjustHoursTo?: number,
) {
  const supabase = await createClient();
  const { data: cur } = await supabase
    .from("project_stages")
    .select("id, project_id, ordem, start_date, end_date")
    .eq("id", id)
    .single();
  if (!cur) return { error: "Etapa não encontrada" };

  const startDelta = diffDays(cur.start_date as string, newStart);

  // 1) Atualiza a propria etapa (datas + opcionalmente horas)
  const updatePayload: { start_date: string; end_date: string; horas_estimadas?: number } = {
    start_date: newStart,
    end_date: newEnd,
  };
  if (typeof adjustHoursTo === "number" && adjustHoursTo >= 0) {
    updatePayload.horas_estimadas = adjustHoursTo;
  }
  const { error: e0 } = await supabase
    .from("project_stages")
    .update(updatePayload)
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
