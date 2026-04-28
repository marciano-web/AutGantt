"use client";
import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectStage } from "@/lib/types";

type LoadRow = {
  assignee_id: string;
  stage_id: string;
  project_id: string;
  dia: string;
  horas_dia: number;
};

type ProfileLite = {
  id: string;
  full_name: string;
  jornada_diaria_h: number;
};

type StageRow = ProjectStage & {
  projects: { nome: string } | null;
  profiles: { full_name: string } | null;
};

export function CalendarClient({
  profiles,
  load,
  stages,
}: {
  profiles: ProfileLite[];
  load: LoadRow[];
  stages: StageRow[];
}) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carga & Calendário</h1>
        <p className="text-sm text-muted-foreground">
          Visualização da carga diária por usuário e calendário de etapas.
        </p>
      </div>
      <Tabs defaultValue="load">
        <TabsList>
          <TabsTrigger value="load">Carga por usuário</TabsTrigger>
          <TabsTrigger value="cal">Calendário</TabsTrigger>
        </TabsList>
        <TabsContent value="load">
          <LoadGrid profiles={profiles} load={load} />
        </TabsContent>
        <TabsContent value="cal">
          <Card>
            <CardContent className="pt-6">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                locale={ptBrLocale}
                height="auto"
                events={stages.map((s) => ({
                  id: s.id,
                  title: `${s.projects?.nome ?? ""} · ${s.nome}${
                    s.profiles?.full_name ? " (" + s.profiles.full_name + ")" : ""
                  }`,
                  start: s.start_date,
                  end: addDay(s.end_date),
                  backgroundColor: statusColor(s.status),
                  borderColor: statusColor(s.status),
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function addDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function statusColor(s: string) {
  switch (s) {
    case "concluido":
      return "#10b981";
    case "em_andamento":
      return "#3b82f6";
    case "cancelado":
      return "#9ca3af";
    default:
      return "#6366f1";
  }
}

function LoadGrid({
  profiles,
  load,
}: {
  profiles: ProfileLite[];
  load: LoadRow[];
}) {
  const [weeks, setWeeks] = useState(8);
  const [origin, setOrigin] = useState(() => mondayOf(new Date()));

  const days = useMemo(() => {
    const out: Date[] = [];
    const start = new Date(origin);
    for (let w = 0; w < weeks; w++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        out.push(d);
      }
    }
    return out;
  }, [origin, weeks]);

  const byUserDay = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of load) {
      const u = r.assignee_id;
      if (!m.has(u)) m.set(u, new Map());
      const day = r.dia.slice(0, 10);
      m.get(u)!.set(day, (m.get(u)!.get(day) ?? 0) + Number(r.horas_dia));
    }
    return m;
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">Carga diária (h)</CardTitle>
          <CardDescription>
            Soma de horas/dia (horas ÷ dias úteis da etapa) por usuário.
            Verde &lt; 80% jornada · Amarelo 80–100% · Vermelho &gt; 100%.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs px-3 py-1 rounded-md border"
            onClick={() => {
              const d = new Date(origin);
              d.setDate(d.getDate() - 7);
              setOrigin(d);
            }}
          >
            ← semana
          </button>
          <button
            className="text-xs px-3 py-1 rounded-md border"
            onClick={() => setOrigin(mondayOf(new Date()))}
          >
            hoje
          </button>
          <button
            className="text-xs px-3 py-1 rounded-md border"
            onClick={() => {
              const d = new Date(origin);
              d.setDate(d.getDate() + 7);
              setOrigin(d);
            }}
          >
            semana →
          </button>
          <select
            className="text-xs h-7 rounded-md border px-2 bg-background"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          >
            {[4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n} sem
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {profiles.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhum usuário ativo.
          </div>
        ) : (
          <table className="text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background border-b border-border text-left px-2 py-2 min-w-[180px] z-10">
                  Usuário
                </th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    className={`border-b border-border px-1 py-2 text-center min-w-[44px] ${
                      sameDay(d, new Date()) ? "bg-accent" : ""
                    } ${
                      d.getDay() === 1 && i > 0 ? "border-l border-border" : ""
                    }`}
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </div>
                    <div>{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                ))}
                <th className="sticky right-0 bg-background border-b border-border text-right px-3 py-2 min-w-[80px] z-10">
                  Σ
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const total = days.reduce(
                  (acc, d) =>
                    acc + (byUserDay.get(p.id)?.get(toIso(d)) ?? 0),
                  0,
                );
                return (
                  <tr key={p.id}>
                    <td className="sticky left-0 bg-background border-b border-border px-2 py-1 z-10 font-medium">
                      <div>{p.full_name || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.jornada_diaria_h}h/dia
                      </div>
                    </td>
                    {days.map((d, i) => {
                      const h = byUserDay.get(p.id)?.get(toIso(d)) ?? 0;
                      const pct = h / Math.max(p.jornada_diaria_h, 0.01);
                      return (
                        <td
                          key={i}
                          className={`border-b border-border text-center py-1 ${
                            d.getDay() === 1 && i > 0 ? "border-l border-border" : ""
                          }`}
                          style={{
                            background: cellBg(pct, h > 0),
                            color: pct > 1 ? "white" : undefined,
                          }}
                          title={`${h.toFixed(1)} h (${(pct * 100).toFixed(0)}%)`}
                        >
                          {h > 0 ? h.toFixed(1) : ""}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-background border-b border-border text-right px-3 py-1 z-10 font-medium">
                      {total.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function cellBg(pct: number, hasLoad: boolean) {
  if (!hasLoad) return "transparent";
  if (pct > 1) return "hsl(0 84% 60% / 0.85)";
  if (pct >= 0.8) return "hsl(38 92% 50% / 0.45)";
  return "hsl(142 71% 45% / 0.25)";
}

function mondayOf(d: Date) {
  const r = new Date(d);
  const dow = r.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
