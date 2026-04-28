export type Role = "admin" | "member";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
  custo_hora: number;
  jornada_diaria_h: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DemandType = {
  id: string;
  nome: string;
  descricao: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};

export type StageTemplate = {
  id: string;
  demand_type_id: string;
  ordem: number;
  nome: string;
  horas_default: number;
  created_at: string;
};

export type ProjectStatus =
  | "planejado"
  | "em_andamento"
  | "pausado"
  | "concluido"
  | "cancelado";

export type StageStatus = "planejado" | "em_andamento" | "concluido" | "cancelado";

export type Project = {
  id: string;
  demand_type_id: string;
  nome: string;
  cliente: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by: string | null;
};

export type ProjectStage = {
  id: string;
  project_id: string;
  stage_template_id: string | null;
  assignee_id: string | null;
  ordem: number;
  nome: string;
  start_date: string;
  end_date: string;
  horas_estimadas: number;
  status: StageStatus;
  progresso: number;
  created_at: string;
  updated_at: string;
};

export type StageRealView = {
  stage_id: string;
  project_id: string;
  horas_reais: number;
  custo_real: number;
  has_running: boolean;
};

export type ProjectCostView = {
  project_id: string;
  nome: string;
  custo_total: number;
  horas_total: number;
  horas_estimadas_total: number;
  qtd_etapas: number;
};

export type TimeEntry = {
  id: string;
  stage_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  hourly_rate: number;
  created_at: string;
};
