"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" className="w-full justify-start" onClick={logout}>
      <LogOut className="h-4 w-4" />
      Sair
    </Button>
  );
}
