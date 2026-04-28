import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: projectsCount },
    { count: stagesCount },
    { data: costs },
    { count: usersCount },
  ] = await Promise.all([
    supabase.from("projects").select("*", { count: "exact", head: true }),
    supabase.from("project_stages").select("*", { count: "exact", head: true }),
    supabase.from("v_project_costs").select("*"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const totalCost =
    costs?.reduce((acc: number, p) => acc + Number(p.custo_total ?? 0), 0) ?? 0;
  const totalHours =
    costs?.reduce((acc: number, p) => acc + Number(p.horas_total ?? 0), 0) ?? 0;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat title="Projetos" value={projectsCount ?? 0} />
        <Stat title="Etapas" value={stagesCount ?? 0} />
        <Stat title="Horas planejadas" value={`${Number(totalHours).toFixed(1)} h`} />
        <Stat title="Custo total" value={brl(totalCost)} />
        <Stat title="Usuários" value={usersCount ?? 0} />
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
