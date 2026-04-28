import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";

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
      <AppSidebar
        fullName={profile?.full_name ?? ""}
        email={user.email ?? ""}
        role={profile?.role ?? "member"}
      />
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
