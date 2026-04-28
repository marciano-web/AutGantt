# AutGantt

Planejador visual de demandas: cadastro de tipos de demanda com etapas-padrão, projetos com Gantt clássico, custo por etapa (incluindo hora extra) e visualização da carga diária por usuário.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions, Turbopack)
- **TypeScript** + **Tailwind CSS v4**
- **Supabase** (Postgres + Auth + RLS)
- **@wamra/gantt-task-react** — Gantt chart
- **FullCalendar** — calendário mensal
- **Radix UI primitives** (Dialog, Select, Tabs, Label, Slot, Dropdown)

## Modelo de custo

Para cada etapa:

```
horas_dia_média = horas_estimadas / dias_úteis_da_etapa

se horas_dia_média ≤ jornada_diária:
    custo = horas × custo_hora + custo_fixo
senão:
    horas_normais = jornada × dias_úteis
    horas_extras  = horas_estimadas − horas_normais
    custo = horas_normais × custo_hora
          + horas_extras  × custo_hora × (1 + adicional_he%/100)
          + custo_fixo
```

Custo do projeto = soma dos custos das etapas (recalculado por trigger no banco).

## Setup local

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # preenche NEXT_PUBLIC_SUPABASE_URL e ANON_KEY
npm run dev
```

O **primeiro usuário** que se cadastrar pela tela de login vira `admin` automaticamente. Em seguida, esse admin pode editar custo/jornada/HE de qualquer usuário e cadastrar tipos de demanda.

## Deploy (Railway)

1. **Connect** o repo `marciano-web/AutGantt` no Railway.
2. Em **Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. O Railway lê o `railway.json` deste repo e usa Nixpacks para build (`npm ci && npm run build`) e start (`npm run start` na porta `$PORT`).

## Estrutura

```
src/
├── app/
│   ├── (app)/                 # rotas autenticadas com sidebar
│   │   ├── page.tsx           # dashboard
│   │   ├── projects/          # lista, criar, detalhe (Gantt embutido)
│   │   ├── gantt/             # Gantt geral (todos os projetos)
│   │   ├── calendar/          # carga + calendário
│   │   ├── demand-types/      # tipos + etapas-padrão (admin)
│   │   └── users/             # custo_hora / jornada / HE%
│   ├── login/
│   └── layout.tsx
├── components/
│   ├── ui/                    # primitives (button, card, dialog, ...)
│   └── project-gantt.tsx
├── lib/
│   ├── supabase/              # browser, server, middleware clients
│   ├── types.ts               # tipos do domínio
│   └── utils.ts               # cn, brl, businessDays, computeStageCost
└── middleware.ts              # auth gate
```

## Schema (resumo)

- `profiles` — extends `auth.users`. Campos: `custo_hora`, `jornada_diaria_h`, `adicional_he_pct`, `role`.
- `demand_types` — tipo de demanda.
- `stage_templates` — etapas-padrão de cada tipo.
- `projects` — uma demanda concreta.
- `project_stages` — etapas do projeto (datas, assignee, horas, custo). `custo_calc` é recalculado por trigger.
- `v_project_costs` — custo total e horas totais por projeto.
- `v_user_daily_load` — distribuição diária de horas por usuário (alimenta a view de carga).

## RLS

- Todos autenticados leem todas as tabelas.
- `demand_types` e `stage_templates`: somente admins escrevem.
- `profiles`: cada usuário edita o próprio; admins editam todos.
- `projects` e `project_stages`: qualquer autenticado cria/edita.
