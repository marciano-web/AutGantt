"use client";
import type { ProjectStage } from "@/lib/types";
import {
  deriveStageStatus,
  statusLabel,
  type DerivedStatus,
} from "@/lib/stage-status";

type StageInput = ProjectStage & {
  projects?: { nome: string } | null;
  profiles?: { full_name: string } | null;
};

const STATUS_FILL: Record<DerivedStatus, string> = {
  planejado: "#94a3b8",
  em_andamento: "#3b82f6",
  concluido: "#10b981",
  atrasado: "#ef4444",
  cancelado: "#cbd5e1",
};

const LEGEND_ORDER: DerivedStatus[] = [
  "planejado",
  "em_andamento",
  "concluido",
  "atrasado",
  "cancelado",
];

const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function CustomGantt({
  stages,
  hasTimeLogged,
}: {
  stages: StageInput[];
  hasTimeLogged: (stageId: string) => boolean;
}) {
  if (stages.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Sem etapas para exibir.
      </div>
    );
  }

  // Agrupa por projeto
  const byProject = new Map<string, StageInput[]>();
  for (const s of stages) {
    if (!byProject.has(s.project_id)) byProject.set(s.project_id, []);
    byProject.get(s.project_id)!.push(s);
  }
  type Group = {
    id: string;
    name: string;
    stages: StageInput[];
    minStart: Date;
    maxEnd: Date;
  };
  const groups: Group[] = [];
  for (const [id, list] of byProject) {
    list.sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) || a.ordem - b.ordem,
    );
    let minS = list[0].start_date;
    let maxE = list[0].end_date;
    for (const s of list) {
      if (s.start_date < minS) minS = s.start_date;
      if (s.end_date > maxE) maxE = s.end_date;
    }
    groups.push({
      id,
      name: list[0].projects?.nome ?? "—",
      stages: list,
      minStart: parseISO(minS),
      maxEnd: parseISO(maxE),
    });
  }
  groups.sort((a, b) => a.minStart.getTime() - b.minStart.getTime());

  // Janela total — completa meses cheios pra dar respiro
  let minDate = groups[0].minStart;
  let maxDate = groups[0].maxEnd;
  for (const g of groups) {
    if (g.minStart < minDate) minDate = g.minStart;
    if (g.maxEnd > maxDate) maxDate = g.maxEnd;
  }
  minDate = startOfMonth(minDate);
  maxDate = endOfMonth(maxDate);
  const totalDays =
    Math.round((maxDate.getTime() - minDate.getTime()) / 86400000) + 1;

  // Layout — sem coluna fixa de label; SVG escala via viewBox
  const chartW = 1400;
  const dayW = chartW / totalDays;
  const showDaily = dayW >= 11;
  const showWeekly = !showDaily && dayW >= 3.5;

  const monthHeaderH = 22;
  const dayHeaderH = showDaily || showWeekly ? 18 : 0;
  const headerH = monthHeaderH + dayHeaderH;
  const projectH = 22;
  const rowH = 22;

  let totalH = headerH;
  for (const g of groups) totalH += projectH + g.stages.length * rowH;

  function dayX(date: Date): number {
    const days = Math.round((date.getTime() - minDate.getTime()) / 86400000);
    return days * dayW;
  }

  // Segmentos de mes
  const months: { start: Date; end: Date; label: string }[] = [];
  let cur = startOfMonth(minDate);
  while (cur <= maxDate) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const segStart = cur < minDate ? minDate : cur;
    const segEnd = next > maxDate ? maxDate : addDays(next, -1);
    months.push({
      start: segStart,
      end: segEnd,
      label: cur
        .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        .toUpperCase(),
    });
    cur = next;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const showToday = today >= minDate && today <= maxDate;

  // Etiqueta preferencialmente a direita da barra; se nao couber dentro do
  // viewport (chartW), cai pra esquerda pra nao cortar o texto.
  // estLabelW = largura estimada do texto (chars * ~5px na fonte 9pt da SVG).
  function pickLabelSide(barX: number, barW: number, estLabelW: number) {
    const rightX = barX + barW + 4;
    if (rightX + estLabelW <= chartW - 2) {
      return { x: rightX, anchor: "start" as const };
    }
    return { x: barX - 4, anchor: "end" as const };
  }

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto print:overflow-visible custom-gantt-print">
        <svg
          viewBox={`0 0 ${chartW} ${totalH}`}
          width="100%"
          preserveAspectRatio="xMinYMin meet"
          className="font-sans"
          style={{ minHeight: 240 }}
        >
          {/* Faixa de fundo do header */}
          <rect
            x={0}
            y={0}
            width={chartW}
            height={headerH}
            fill="#f8fafc"
          />

          {/* Linhas verticais entre meses + label do mes */}
          {months.map((m, i) => {
            const x = dayX(m.start);
            const xEnd = dayX(m.end) + dayW;
            const cx = (x + xEnd) / 2;
            return (
              <g key={`m-${i}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={totalH}
                  stroke="#cbd5e1"
                  strokeWidth={0.7}
                />
                <text
                  x={cx}
                  y={14}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="#334155"
                  fontWeight={700}
                  letterSpacing={0.5}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
          {/* Borda fechando ultimo mes */}
          <line
            x1={dayX(maxDate) + dayW}
            y1={0}
            x2={dayX(maxDate) + dayW}
            y2={totalH}
            stroke="#cbd5e1"
            strokeWidth={0.7}
          />

          {/* Banda diaria (numero + dia da semana) */}
          {showDaily &&
            (() => {
              const elements: React.ReactNode[] = [];
              for (let i = 0; i < totalDays; i++) {
                const date = addDays(minDate, i);
                const x = i * dayW;
                const wd = date.getDay();
                const isWeekend = wd === 0 || wd === 6;
                if (isWeekend) {
                  elements.push(
                    <rect
                      key={`wknd-${i}`}
                      x={x}
                      y={monthHeaderH}
                      width={dayW}
                      height={totalH - monthHeaderH}
                      fill="#f1f5f9"
                      opacity={0.5}
                    />,
                  );
                }
                elements.push(
                  <text
                    key={`d-${i}`}
                    x={x + dayW / 2}
                    y={monthHeaderH + 9}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#475569"
                    fontWeight={500}
                  >
                    {date.getDate()}
                  </text>,
                );
                elements.push(
                  <text
                    key={`wd-${i}`}
                    x={x + dayW / 2}
                    y={monthHeaderH + 16}
                    textAnchor="middle"
                    fontSize={7}
                    fill="#94a3b8"
                  >
                    {WEEKDAY_LETTERS[wd]}
                  </text>,
                );
                // Linha vertical fina por dia (so se daily)
                elements.push(
                  <line
                    key={`vl-${i}`}
                    x1={x}
                    y1={headerH}
                    x2={x}
                    y2={totalH}
                    stroke="#f1f5f9"
                    strokeWidth={0.3}
                  />,
                );
              }
              return elements;
            })()}

          {/* Banda semanal (so se nao couber daily) */}
          {showWeekly &&
            (() => {
              const elements: React.ReactNode[] = [];
              for (let i = 0; i < totalDays; i++) {
                const date = addDays(minDate, i);
                if (date.getDay() === 1) {
                  const x = i * dayW;
                  const week = isoWeek(date);
                  elements.push(
                    <text
                      key={`w-${i}`}
                      x={x + (dayW * 7) / 2}
                      y={monthHeaderH + 12}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#475569"
                    >
                      W{week}
                    </text>,
                  );
                  elements.push(
                    <line
                      key={`wl-${i}`}
                      x1={x}
                      y1={headerH}
                      x2={x}
                      y2={totalH}
                      stroke="#f1f5f9"
                      strokeWidth={0.4}
                    />,
                  );
                }
              }
              return elements;
            })()}

          {/* Linha horizontal abaixo do header */}
          <line
            x1={0}
            y1={headerH}
            x2={chartW}
            y2={headerH}
            stroke="#cbd5e1"
            strokeWidth={0.8}
          />

          {/* Linha de hoje */}
          {showToday && (
            <line
              x1={dayX(today) + dayW / 2}
              y1={0}
              x2={dayX(today) + dayW / 2}
              y2={totalH}
              stroke="#ef4444"
              strokeWidth={1.2}
              strokeDasharray="3,2"
            />
          )}

          {/* Faixa de fundo alternada (zebra) por etapa */}
          {(() => {
            const stripes: React.ReactNode[] = [];
            let y = headerH;
            for (const g of groups) {
              y += projectH;
              for (let i = 0; i < g.stages.length; i++) {
                if (i % 2 === 1) {
                  stripes.push(
                    <rect
                      key={`zebra-${g.id}-${i}`}
                      x={0}
                      y={y}
                      width={chartW}
                      height={rowH}
                      fill="#fafafa"
                    />,
                  );
                }
                y += rowH;
              }
            }
            return stripes;
          })()}

          {/* Linhas de projeto + etapas */}
          {(() => {
            const elements: React.ReactNode[] = [];
            let y = headerH;
            for (const g of groups) {
              // Faixa de fundo do projeto (mais escura pra separar bem)
              elements.push(
                <rect
                  key={`pbg-${g.id}`}
                  x={0}
                  y={y}
                  width={chartW}
                  height={projectH}
                  fill="#cbd5e1"
                />,
              );
              // Linha de borda inferior pra reforcar separacao
              elements.push(
                <line
                  key={`pborder-${g.id}`}
                  x1={0}
                  y1={y + projectH}
                  x2={chartW}
                  y2={y + projectH}
                  stroke="#94a3b8"
                  strokeWidth={0.6}
                />,
              );
              // Span do projeto (barra mais escura pra contrastar com o fundo)
              const pBarX = dayX(g.minStart);
              const pBarW = Math.max(
                2,
                ((g.maxEnd.getTime() - g.minStart.getTime()) / 86400000 + 1) *
                  dayW,
              );
              elements.push(
                <rect
                  key={`pspan-${g.id}`}
                  x={pBarX}
                  y={y + projectH / 2 - 3}
                  width={pBarW}
                  height={6}
                  fill="#475569"
                  opacity={0.7}
                  rx={2}
                />,
              );
              // Label do projeto a direita do span (cai pra esquerda se nao couber)
              const pLabel = truncate(g.name, 60);
              const pEstW = pLabel.length * 5.6 + 4; // fonte 10.5pt bold
              const pSide = pickLabelSide(pBarX, pBarW, pEstW);
              elements.push(
                <text
                  key={`pname-${g.id}`}
                  x={pSide.x}
                  y={y + projectH / 2 + 3.5}
                  textAnchor={pSide.anchor}
                  fontSize={10.5}
                  fontWeight={700}
                  fill="#0f172a"
                >
                  {pLabel}
                </text>,
              );
              y += projectH;

              for (const s of g.stages) {
                const sStart = parseISO(s.start_date);
                const sEnd = parseISO(s.end_date);
                const status = deriveStageStatus(s, hasTimeLogged(s.id));
                const barX = dayX(sStart);
                const barW = Math.max(
                  2,
                  ((sEnd.getTime() - sStart.getTime()) / 86400000 + 1) * dayW,
                );
                // Etiqueta: nome curto + responsavel
                const label = `${s.ordem}. ${s.nome}${
                  s.profiles?.full_name
                    ? ` · ${shortName(s.profiles.full_name)}`
                    : ""
                }`;
                const labelTrunc = truncate(label, 70);
                const estW = labelTrunc.length * 5 + 4; // fonte 9pt
                const side = pickLabelSide(barX, barW, estW);
                elements.push(
                  <g key={`s-${s.id}`}>
                    {/* Barra */}
                    <rect
                      x={barX}
                      y={y + 5}
                      width={barW}
                      height={rowH - 10}
                      fill={STATUS_FILL[status]}
                      rx={2}
                    />
                    {/* Etiqueta inline */}
                    <text
                      x={side.x}
                      y={y + rowH / 2 + 3}
                      textAnchor={side.anchor}
                      fontSize={9}
                      fill="#0f172a"
                    >
                      {labelTrunc}
                    </text>
                  </g>,
                );
                y += rowH;
              }
            }
            return elements;
          })()}

          {/* Moldura externa */}
          <rect
            x={0}
            y={0}
            width={chartW}
            height={totalH}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={0.8}
          />
        </svg>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        {LEGEND_ORDER.map((st) => (
          <div key={st} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: STATUS_FILL[st] }}
            />
            <span>{statusLabel[st]}</span>
          </div>
        ))}
        {showToday && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-0 border-t border-dashed"
              style={{ borderColor: "#ef4444", borderTopWidth: 1.5 }}
            />
            <span>Hoje</span>
          </div>
        )}
      </div>
    </div>
  );
}

function parseISO(s: string): Date {
  return new Date(s + "T00:00:00");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function shortName(full: string): string {
  // "Marciano Foletto Marques" -> "Marciano F. Marques"
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 2) return full;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = parts
    .slice(1, -1)
    .map((p) => p.charAt(0).toUpperCase() + ".")
    .join(" ");
  return `${first} ${middle} ${last}`;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}
