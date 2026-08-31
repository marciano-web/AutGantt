"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDay } from "@/lib/holidays";
import { computeDailyPlanned } from "@/lib/load";

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
  // Pega as etapas DESTE projeto (com datas) pra saber quais (user, dia) sao
  // de fato afetados — nao queremos avisar sobre dias anteriores ao inicio
  // do projeto, pois reprogramar este projeto nao vai consertar sobrecarga
  // que vem de outros projetos antigos em datas que este nao toca.
  const { data: ownStages } = await supabase
    .from("project_stages")
    .select("assignee_id, start_date, end_date, status")
    .eq("project_id", projectId)
    .not("assignee_id", "is", null);
  type OwnStage = {
    assignee_id: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  const ownStagesTyped = (ownStages ?? []) as OwnStage[];
  const userIds = Array.from(
    new Set(ownStagesTyped.map((r) => r.assignee_id)),
  );
  if (userIds.length === 0) return [];

  // Constroi set de dias afetados pelo NOVO projeto, por user
  const ownDaysByUser = new Map<string, Set<string>>();
  for (const s of ownStagesTyped) {
    if (s.status === "concluido" || s.status === "cancelado") continue;
    const uid = s.assignee_id;
    if (!ownDaysByUser.has(uid)) ownDaysByUser.set(uid, new Set());
    const set = ownDaysByUser.get(uid)!;
    for (const d of listBusinessDaysInRange(s.start_date, s.end_date)) {
      set.add(d);
    }
  }

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

  // Busca etapas dos users envolvidos (NAO usa v_user_daily_planned porque
  // a view nao filtra concluido/cancelado — calculamos em codigo).
  const { data: rawStages } = await supabase
    .from("project_stages")
    .select("assignee_id, start_date, end_date, horas_estimadas, status")
    .in("assignee_id", userIds);
  type RawStage = {
    assignee_id: string | null;
    start_date: string;
    end_date: string;
    horas_estimadas: number | null;
    status: string;
  };
  const load = computeDailyPlanned(
    ((rawStages ?? []) as RawStage[]).map((s) => ({
      assignee_id: s.assignee_id,
      start_date: s.start_date,
      end_date: s.end_date,
      horas_estimadas: s.horas_estimadas,
      status: s.status,
    })),
  );

  // Agrega horas por (user, dia) — a fonte retorna varias linhas por dia
  // (uma por etapa). Precisa somar antes de calcular pct, senao 8h+8h de
  // projetos diferentes nunca passa de pct > 100% (cada linha = 100% exato).
  const horasByUserDay = new Map<string, Map<string, number>>();
  for (const row of load) {
    const uid = row.assignee_id;
    const day = String(row.dia).slice(0, 10);
    if (!horasByUserDay.has(uid)) horasByUserDay.set(uid, new Map());
    const userMap = horasByUserDay.get(uid)!;
    userMap.set(day, (userMap.get(day) ?? 0) + Number(row.horas_dia ?? 0));
  }

  // Agora calcula pct sobre o total agregado de cada (user, dia).
  // SO inclui no warning os dias em que o NOVO projeto tem etapa
  // — sobrecarga em outros dias nao e responsabilidade deste projeto.
  const byUser = new Map<
    string,
    { dia: string; horas: number; pct: number }[]
  >();
  for (const [uid, daysMap] of horasByUserDay) {
    const prof = profById.get(uid) as
      | { jornada_diaria_h: number }
      | undefined;
    const j = Number(prof?.jornada_diaria_h ?? 8);
    const ownDays = ownDaysByUser.get(uid);
    if (!ownDays || ownDays.size === 0) continue;
    for (const [day, horas] of daysMap) {
      if (!ownDays.has(day)) continue; // dia nao tocado por este projeto
      const pct = j > 0 ? horas / j : 0;
      // Sobrecarga real: estritamente > 100%
      if (pct > 1.0001) {
        const arr = byUser.get(uid) ?? [];
        arr.push({ dia: day, horas, pct });
        byUser.set(uid, arr);
      }
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

function listBusinessDaysInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  while (d <= e) {
    if (isBusinessDay(d)) out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Reorganiza as etapas do projeto fracionando por HORAS-POR-DIA, não por dias inteiros.
 *
 * Regras (alinhadas com o usuário):
 * - Manual (rodado via botão na tela do projeto)
 * - Sem limite de splits — pode gerar quantos forem necessários
 * - Prioridade: ordem de criação (projetos mais antigos já têm horas alocadas;
 *   este projeto pega o que sobrar da capacidade diária dos seus responsáveis)
 *
 * Cada etapa logica do projeto vira N "partes" — uma por dia útil onde sobra
 * capacidade do responsável. Cada parte e um project_stages com start_date = end_date
 * = aquele dia, e horas_estimadas = horas alocadas naquele dia (limitada pela
 * jornada diaria menos o que ja foi consumido por outras etapas).
 *
 * Idempotente: se a etapa ja foi splitada antes (nome "X (parte i/n)"),
 * mescla os splits, recalcula e re-emite.
 */
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

  // Jornada de cada user envolvido
  const userIds = Array.from(
    new Set(
      stages
        .map((s) => s.assignee_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );
  const jornadaByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, jornada_diaria_h")
      .in("id", userIds);
    for (const p of profs ?? [])
      jornadaByUser.set(
        p.id as string,
        Number(p.jornada_diaria_h ?? HOURS_PER_DAY),
      );
  }

  // Calcula horas/dia ja consumidas por OUTROS projetos (status ativo)
  // Esse e o "ja reservado pelos projetos antigos" — prioridade por ordem de criacao
  const usedByUser = new Map<string, Map<string, number>>();
  for (const uid of userIds) usedByUser.set(uid, new Map());
  if (userIds.length > 0) {
    const { data: other } = await supabase
      .from("project_stages")
      .select("assignee_id, start_date, end_date, horas_estimadas, status")
      .in("assignee_id", userIds)
      .neq("project_id", projectId)
      .not("status", "in", "(concluido,cancelado)");
    for (const o of other ?? []) {
      const uid = o.assignee_id as string;
      const days = listBusinessDaysInRange(
        o.start_date as string,
        o.end_date as string,
      );
      if (days.length === 0) continue;
      const perDay = Number(o.horas_estimadas ?? 0) / days.length;
      const m = usedByUser.get(uid)!;
      for (const d of days) m.set(d, (m.get(d) ?? 0) + perDay);
    }
  }

  // Mescla splits anteriores ("X (parte i/n)") deste projeto.
  // Chave: assignee_id + nome base + stage_template_id (pra nao misturar etapas
  // de templates diferentes que tenham o mesmo nome base).
  type Stage = (typeof stages)[number];
  type Merged = {
    baseStage: Stage;
    baseName: string;
    totalH: number;
    extraIds: string[]; // splits adicionais que serao reciclados ou apagados
  };
  const groups = new Map<string, Stage[]>();
  for (const s of stages) {
    const base = (s.nome as string).replace(/ \(parte \d+\/\d+\)$/, "");
    const uid = (s.assignee_id as string | null) ?? "_";
    const tpl = (s.stage_template_id as string | null) ?? "_";
    // Se nao tem template e nao tem assignee, isola pelo id pra nao mesclar
    // etapas independentes que por acaso tenham o mesmo nome
    const key =
      uid === "_" && tpl === "_"
        ? `solo:${s.id}`
        : `${uid}|${base}|${tpl}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const merged: Merged[] = [];
  for (const [, group] of groups) {
    group.sort((a, b) => (a.ordem as number) - (b.ordem as number));
    const baseStage = group[0];
    const baseName = (baseStage.nome as string).replace(
      / \(parte \d+\/\d+\)$/,
      "",
    );
    const totalH = group.reduce(
      (acc, s) => acc + Number(s.horas_estimadas ?? 0),
      0,
    );
    const extraIds = group.slice(1).map((s) => s.id as string);
    merged.push({ baseStage, baseName, totalH, extraIds });
  }
  merged.sort(
    (a, b) =>
      (a.baseStage.ordem as number) - (b.baseStage.ordem as number),
  );

  const userCursors = new Map<string, Date>();

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
  const deletes: string[] = [];
  let nextOrdem = 1;

  for (const m of merged) {
    const s = m.baseStage;
    const uid = s.assignee_id as string | null;
    const status = (s.status as string) ?? "planejado";

    // Etapas concluidas/canceladas: mantem como estao, sem fracionar
    if (status === "concluido" || status === "cancelado") {
      updates.push({
        id: s.id as string,
        nome: m.baseName,
        ordem: nextOrdem++,
        start_date: s.start_date as string,
        end_date: s.end_date as string,
        horas_estimadas: m.totalH,
      });
      deletes.push(...m.extraIds);
      continue;
    }

    // Sem responsavel: nao da pra fracionar (capacidade desconhecida)
    if (!uid) {
      updates.push({
        id: s.id as string,
        nome: m.baseName,
        ordem: nextOrdem++,
        start_date: s.start_date as string,
        end_date: s.end_date as string,
        horas_estimadas: m.totalH,
      });
      deletes.push(...m.extraIds);
      continue;
    }

    // Sem horas: mantem com data atual (1 dia)
    if (m.totalH <= 0.01) {
      updates.push({
        id: s.id as string,
        nome: m.baseName,
        ordem: nextOrdem++,
        start_date: s.start_date as string,
        end_date: s.start_date as string,
        horas_estimadas: 0,
      });
      deletes.push(...m.extraIds);
      continue;
    }

    const jornada = jornadaByUser.get(uid) ?? HOURS_PER_DAY;
    const usedMap = usedByUser.get(uid)!;

    // Ponto de partida: max(data atual da etapa, projeto start, cursor do user)
    const startCandidate = new Date(
      (s.start_date as string) + "T00:00:00",
    );
    const projStart = new Date(projectStart + "T00:00:00");
    let cursor = nextBusinessDay(
      startCandidate < projStart ? projStart : startCandidate,
    );
    const userCursor = userCursors.get(uid);
    if (userCursor && userCursor > cursor) cursor = new Date(userCursor);

    // Aloca por hora-dia, indo dia a dia, pegando o que sobrar de capacidade
    type Part = { day: Date; hours: number };
    const parts: Part[] = [];
    let remaining = m.totalH;
    let safety = 0;
    while (remaining > 0.01) {
      safety++;
      if (safety > 5000) break; // protecao contra loop infinito

      cursor = nextBusinessDay(cursor);
      const dayKey = toISO(cursor);
      const used = usedMap.get(dayKey) ?? 0;
      const available = jornada - used;
      if (available > 0.01) {
        const placed = Math.min(remaining, available);
        const placedR = Math.round(placed * 100) / 100;
        if (placedR > 0.01) {
          parts.push({ day: new Date(cursor), hours: placedR });
          usedMap.set(dayKey, used + placedR);
          remaining -= placedR;
        }
      }
      // proximo dia
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      cursor = next;
    }

    // Atualiza cursor do user (proximo dia depois do ultimo alocado)
    if (parts.length > 0) {
      const lastDay = parts[parts.length - 1].day;
      const after = new Date(lastDay);
      after.setDate(after.getDate() + 1);
      userCursors.set(uid, nextBusinessDay(after));
    }

    // Constroi updates/inserts/deletes:
    // - Reusa registros existentes (baseStage.id e extraIds) pra cada parte
    // - Se faltam IDs, cria com insert
    // - Se sobram IDs (parts < existentes), deleta os sobrantes
    const existingIds = [s.id as string, ...m.extraIds];
    parts.forEach((part, i) => {
      const nome =
        parts.length > 1
          ? `${m.baseName} (parte ${i + 1}/${parts.length})`
          : m.baseName;
      const iso = toISO(part.day);
      if (i < existingIds.length) {
        updates.push({
          id: existingIds[i],
          nome,
          ordem: nextOrdem++,
          start_date: iso,
          end_date: iso,
          horas_estimadas: part.hours,
        });
      } else {
        inserts.push({
          project_id: projectId,
          stage_template_id: (s.stage_template_id as string | null) ?? null,
          assignee_id: uid,
          nome,
          ordem: nextOrdem++,
          start_date: iso,
          end_date: iso,
          horas_estimadas: part.hours,
          status,
          progresso: 0,
        });
      }
    });
    if (existingIds.length > parts.length) {
      deletes.push(...existingIds.slice(parts.length));
    }
  }

  // Aplica deletes ANTES dos updates pra liberar IDs (se algum scenario exigir)
  if (deletes.length > 0) {
    const { error } = await supabase
      .from("project_stages")
      .delete()
      .in("id", deletes);
    if (error) return { error: error.message };
  }

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
  return {
    ok: true,
    splitsCreated: inserts.length,
    splitsRemoved: deletes.length,
  };
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

/**
 * Recalcula as datas de uma etapa (ou da etapa em diante, no mesmo projeto)
 * baseado nas horas_estimadas e jornada 8h/dia util.
 *
 * mode "self": mantem o Inicio da etapa, recalcula so o Fim.
 * mode "project": ancora pelo Inicio da etapa clicada e encadeia todas as
 *   etapas seguintes do MESMO projeto (ordem > esta) — cada uma comeca no
 *   proximo dia util depois do Fim da anterior. Etapas concluidas/canceladas
 *   sao puladas (mantem datas; cursor avanca depois do Fim delas).
 */
export async function recalcStageDatesFromHoras(
  stageId: string,
  mode: "self" | "project",
) {
  const supabase = await createClient();

  const { data: trigger } = await supabase
    .from("project_stages")
    .select("id, project_id, ordem, start_date, end_date, horas_estimadas, status")
    .eq("id", stageId)
    .single();
  if (!trigger) return { error: "Etapa nao encontrada" };

  if (mode === "self") {
    const horas = Number(trigger.horas_estimadas ?? 0);
    const days = Math.max(1, Math.ceil(horas / HOURS_PER_DAY));
    const startDate = new Date((trigger.start_date as string) + "T00:00:00");
    const startBd = nextBusinessDay(startDate);
    const endBd = addBusinessDays(startBd, days);
    const newStart = toISO(startBd);
    const newEnd = toISO(endBd);
    const { error } = await supabase
      .from("project_stages")
      .update({ start_date: newStart, end_date: newEnd })
      .eq("id", stageId);
    if (error) return { error: error.message };
    revalidatePath(`/projects/${trigger.project_id}`);
    revalidatePath("/projects");
    revalidatePath("/gantt");
    revalidatePath("/calendar");
    return { ok: true, updated: 1 };
  }

  // mode === "project": encadeia a partir desta etapa
  const { data: stages } = await supabase
    .from("project_stages")
    .select("id, ordem, start_date, end_date, horas_estimadas, status")
    .eq("project_id", trigger.project_id as string)
    .gte("ordem", trigger.ordem as number)
    .order("ordem");
  if (!stages || stages.length === 0)
    return { error: "Sem etapas pra recalcular" };

  let cursor: Date | null = null;
  let updated = 0;
  for (const s of stages) {
    const status = (s.status as string) ?? "planejado";
    // Concluida/cancelada: nao move, so avanca cursor
    if (status === "concluido" || status === "cancelado") {
      const endDate = new Date((s.end_date as string) + "T00:00:00");
      const after = new Date(endDate);
      after.setDate(after.getDate() + 1);
      cursor = nextBusinessDay(after);
      continue;
    }

    const horas = Number(s.horas_estimadas ?? 0);
    const days = Math.max(1, Math.ceil(horas / HOURS_PER_DAY));
    let newStart: Date;
    if (cursor === null) {
      // primeira etapa = a clicada; ancora pelo Inicio atual dela
      newStart = nextBusinessDay(
        new Date((s.start_date as string) + "T00:00:00"),
      );
    } else {
      newStart = nextBusinessDay(cursor);
    }
    const newEnd = addBusinessDays(newStart, days);
    const { error } = await supabase
      .from("project_stages")
      .update({
        start_date: toISO(newStart),
        end_date: toISO(newEnd),
      })
      .eq("id", s.id as string);
    if (error) return { error: error.message };
    updated++;
    const after = new Date(newEnd);
    after.setDate(after.getDate() + 1);
    cursor = nextBusinessDay(after);
  }

  // Janela do projeto
  const { data: all } = await supabase
    .from("project_stages")
    .select("start_date, end_date")
    .eq("project_id", trigger.project_id as string);
  if (all && all.length > 0) {
    let min = all[0].start_date as string;
    let max = all[0].end_date as string;
    for (const r of all) {
      if ((r.start_date as string) < min) min = r.start_date as string;
      if ((r.end_date as string) > max) max = r.end_date as string;
    }
    await supabase
      .from("projects")
      .update({ start_date: min, end_date: max })
      .eq("id", trigger.project_id as string);
  }

  revalidatePath(`/projects/${trigger.project_id}`);
  revalidatePath("/projects");
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true, updated };
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

/**
 * Edita um apontamento de tempo (started_at e/ou ended_at).
 * O custo e recalculado automaticamente pela view v_stage_real
 * (cost = duration * hourly_rate, sendo hourly_rate o snapshot
 * registrado no momento do start — nao se altera).
 *
 * Restricoes:
 * - Apontamento precisa estar fechado (ended_at != null)
 * - Apenas o dono do apontamento pode editar
 * - Fim deve ser posterior ao inicio
 */
export async function updateTimeEntry(
  entryId: string,
  startedAtIso: string,
  endedAtIso: string,
) {
  const supabase = await createClient();

  const startMs = new Date(startedAtIso).getTime();
  const endMs = new Date(endedAtIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs))
    return { error: "Datas invalidas" };
  if (endMs <= startMs)
    return { error: "Fim deve ser posterior ao inicio" };

  const { data: existing } = await supabase
    .from("time_entries")
    .select("id, ended_at, user_id, stage_id")
    .eq("id", entryId)
    .single();
  if (!existing) return { error: "Apontamento nao encontrado" };
  if (existing.ended_at === null)
    return { error: "Nao da pra editar um apontamento em execucao — pause antes" };

  const { data: u } = await supabase.auth.getUser();
  if (u.user?.id !== existing.user_id)
    return { error: "Sem permissao — voce so pode editar seus proprios apontamentos" };

  const { error } = await supabase
    .from("time_entries")
    .update({
      started_at: new Date(startedAtIso).toISOString(),
      ended_at: new Date(endedAtIso).toISOString(),
    })
    .eq("id", entryId);
  if (error) return { error: error.message };

  revalidatePath(`/projects`, "layout");
  return { ok: true };
}
