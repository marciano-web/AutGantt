import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calendar,
  GanttChart,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projetos", icon: ListChecks },
  { href: "/gantt", label: "Gantt", icon: GanttChart },
  { href: "/calendar", label: "Carga", icon: Calendar },
  { href: "/demand-types", label: "Tipos de demanda", icon: Settings },
  { href: "/users", label: "Usuários", icon: Users },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="w-60 border-r border-border bg-card flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <div className="font-semibold tracking-tight">AutGantt</div>
          <div className="text-xs text-muted-foreground">
            {profile?.full_name ?? user.email}
            {profile?.role === "admin" && " · admin"}
          </div>
        </div>
        <nav className="flex-1 p-2 grid gap-1">
          {navItems.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition"
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-border">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
