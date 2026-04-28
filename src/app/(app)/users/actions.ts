"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(id: string, formData: FormData) {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    full_name: String(formData.get("full_name") ?? ""),
    custo_hora: Number(formData.get("custo_hora") ?? 0),
    jornada_diaria_h: Number(formData.get("jornada_diaria_h") ?? 8),
    is_active: formData.get("is_active") === "on",
    updated_at: new Date().toISOString(),
  };
  const role = formData.get("role");
  if (role) payload.role = String(role);

  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/users");
  revalidatePath("/gantt");
  revalidatePath("/calendar");
  return { ok: true };
}
