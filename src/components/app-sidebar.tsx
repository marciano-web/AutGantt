"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  FileText,
  GanttChart,
  LayoutDashboard,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projetos", icon: ListChecks },
  { href: "/gantt", label: "Gantt", icon: GanttChart },
  { href: "/calendar", label: "Carga", icon: Calendar },
  { href: "/reports", label: "Relatórios", icon: FileText },
  { href: "/demand-types", label: "Tipos de demanda", icon: Settings },
  { href: "/users", label: "Usuários", icon: Users },
];

export function AppSidebar({
  fullName,
  email,
  role,
}: {
  fullName: string;
  email: string;
  role: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem("autgantt:sidebar") === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("autgantt:sidebar", next ? "1" : "0");
  }

  return (
    <aside
      className={cn(
        "border-r border-border bg-card flex flex-col print:hidden transition-[width] duration-200",
        mounted && collapsed ? "w-14" : "w-60",
      )}
    >
      <div className="px-3 py-3 border-b border-border flex items-center justify-between gap-2">
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold tracking-tight truncate">
              AutGantt
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {fullName || email}
              {role === "admin" && " · admin"}
            </div>
          </div>
        )}
        <button
          onClick={toggle}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
      <nav className="flex-1 p-2 grid gap-1">
        {navItems.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/" && pathname?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              title={collapsed ? it.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent",
                collapsed && "justify-center px-0",
              )}
            >
              <it.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className={cn("p-2 border-t border-border", collapsed && "px-1")}>
        <LogoutButton collapsed={collapsed} />
      </div>
    </aside>
  );
}
