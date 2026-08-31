"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/users");
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  revalidatePath("/projects");
  revalidatePath("/reports");
}

export async function updateProfile(id: string, formData: FormData) {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    full_name: String(formData.get("full_name") ?? ""),
    custo_hora: Number(formData.get("custo_hora") ?? 0),
    jornada_diaria_h: Number(formData.get("jornada_diaria_h") ?? 8),
    is_active: formData.get("is_active") === "on",
    can_view_all_projects: formData.get("can_view_all_projects") !== "off",
    updated_at: new Date().toISOString(),
  };
  const role = formData.get("role");
  if (role) payload.role = String(role);

  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function createClienteProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { error: "Não autenticado" };
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", me.user.id)
    .single();
  if (myProfile?.role !== "admin") return { error: "Apenas admins podem criar clientes" };

  const name = String(formData.get("full_name") ?? "").trim();
  if (!name) return { error: "Nome obrigatório" };

  const { error } = await supabase.from("profiles").insert({
    full_name: name,
    email: null,
    role: "cliente",
    custo_hora: 0,
    jornada_diaria_h: 8,
    is_active: true,
    can_view_all_projects: formData.get("can_view_all_projects") !== "off",
  });
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}
