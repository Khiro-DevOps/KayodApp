"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function updateApplicationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin"].includes(profile.role)) redirect("/dashboard");

  const applicationId = formData.get("application_id") as string;
  const status = formData.get("status") as string;
  if (!applicationId || !status) redirect("/applications");

  await supabase
    .from("applications")
    .update({ status })
    .eq("id", applicationId);

  // Auto-create employee when hired
  if (status === "hired") {
    const { data: app } = await supabase
      .from("applications")
      .select("candidate_id, job_postings(title)")
      .eq("id", applicationId)
      .single();

    if (app) {
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", app.candidate_id)
        .maybeSingle();

      if (!existing) {
        const jobTitle = (app.job_postings as unknown as { title: string })?.title ?? "Employee";
        await supabase.from("employees").insert({
          profile_id:        app.candidate_id,
          application_id:    applicationId,
          job_title:         jobTitle,
          start_date:        new Date().toISOString().split("T")[0],
          base_salary:       0,
          employment_status: "active",
          employment_type:   "full_time",
          pay_frequency:     "monthly",
        });
        // Update profile role to employee
        await supabase
          .from("profiles")
          .update({ role: "employee" })
          .eq("id", app.candidate_id);
      }
    }
  }

  revalidatePath("/applications");
  revalidatePath("/employees");
  revalidatePath("/dashboard");
}
