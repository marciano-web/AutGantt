"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button
      variant="ghost"
      className={collapsed ? "w-full justify-center px-0" : "w-full justify-start"}
      onClick={logout}
      title={collapsed ? "Sair" : undefined}
    >
      <LogOut className="h-4 w-4" />
      {!collapsed && "Sair"}
    </Button>
  );
}
