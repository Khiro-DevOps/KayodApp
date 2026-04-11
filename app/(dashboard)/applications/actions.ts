"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function withdrawApplication(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const applicationId = formData.get("application_id") as string;
  if (!applicationId) redirect("/applications");

  // Verify the application belongs to the user
  const { data: application } = await supabase
    .from("applications")
    .select("id, candidate_id, status")
    .eq("id", applicationId)
    .single();

  if (!application || application.candidate_id !== user.id) {
    redirect("/applications");
  }

  // Can only withdraw if status is "applied"
  if (application.status !== "applied") {
    redirect("/applications");
  }

  // Update status to withdrawn
  await supabase
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId);

  revalidatePath("/applications");
  redirect("/applications?success=Application+withdrawn+successfully");
}
