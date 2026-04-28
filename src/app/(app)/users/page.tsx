import { createClient } from "@/lib/supabase/server";
import { UsersClient } from "./client";

export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.user?.id ?? "")
    .single();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");

  return (
    <UsersClient
      profiles={profiles ?? []}
      meId={user.user?.id ?? ""}
      isAdmin={me?.role === "admin"}
    />
  );
}
