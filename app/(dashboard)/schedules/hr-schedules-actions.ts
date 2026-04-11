"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function assignShift(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["hr_manager", "admin"].includes(profile.role)) redirect("/dashboard");

  const employeeId = formData.get("employee_id") as string;
  const weekStart  = formData.get("week_start") as string;
  const shift      = formData.get("shift") as string;
  const location   = formData.get("location") as string | null;

  if (!employeeId || !weekStart || !shift) redirect("/schedules");

  const shiftTimes: Record<string, { start: string; end: string }> = {
    morning:   { start: "08:00", end: "17:00" },
    afternoon: { start: "13:00", end: "22:00" },
    evening:   { start: "17:00", end: "02:00" },
    night:     { start: "22:00", end: "07:00" },
  };

  const times = shiftTimes[shift] ?? shiftTimes.morning;

  // Upsert — update if exists, insert if not
  const { error } = await supabase
    .from("schedules")
    .upsert({
      employee_id:  employeeId,
      week_start:   weekStart,
      shift:        shift,
      shift_start:  times.start,
      shift_end:    times.end,
      location:     location || null,
      is_published: true,
      created_by:   user.id,
    }, { onConflict: "employee_id,week_start" });

  if (error) redirect(`/schedules?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/schedules");
  redirect("/schedules");
}
