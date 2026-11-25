import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import PageContainer from "@/components/ui/page-container";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import SupervisorUndertimeQueue, {
  type SupervisorUndertimeItem,
} from "@/components/undertime/SupervisorUndertimeQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Approvals | Kayod",
  description: "Immediate supervisor operational approvals including Undertime requests",
};

export default async function TeamApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = getAdminClient();
  const { data: myEmployee } = await admin
    .from("employees")
    .select("id, tenant_id")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; tenant_id: string | null }>();

  if (!myEmployee) redirect("/employee/dashboard");

  const { data: reports } = await admin
    .from("employees")
    .select("id, job_title, profile:profiles!profile_id(first_name, last_name)")
    .eq("reports_to", myEmployee.id)
    .eq("employment_status", "active");

  const reportMap = new Map<string, { name: string; initials: string; jobTitle: string }>();
  const reportIds: string[] = [];
  for (const r of reports ?? []) {
    const row = r as {
      id: string;
      job_title: string | null;
      profile:
        | { first_name: string | null; last_name: string | null }
        | Array<{ first_name: string | null; last_name: string | null }>
        | null;
    };
    const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const name =
      [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || "Direct Report";
    const parts = name.split(/\s+/).filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : name.slice(0, 2).toUpperCase();
    reportIds.push(row.id);
    reportMap.set(row.id, { name, initials, jobTitle: row.job_title ?? "Staff" });
  }

  let undertimeItems: SupervisorUndertimeItem[] = [];
  if (reportIds.length > 0) {
    const { data: utRows } = await admin
      .from("undertime_requests")
      .select(
        "id, employee_id, work_date, undertime_type, scheduled_in, scheduled_out, requested_in, requested_out, undertime_minutes, reason, coverage_notes, deduction_mode, created_at"
      )
      .in("employee_id", reportIds)
      .eq("status", "pending_supervisor")
      .order("work_date", { ascending: true });

    undertimeItems = (utRows ?? []).map((u) => {
      const row = u as {
        id: string;
        employee_id: string;
        work_date: string;
        undertime_type?: "early_out" | "late_in" | "half_day_first" | "half_day_second";
        scheduled_in?: string | null;
        scheduled_out: string;
        requested_in?: string | null;
        requested_out: string | null;
        undertime_minutes: number;
        reason: string;
        coverage_notes: string | null;
        deduction_mode: "payroll_deduction" | "leave_offset";
        created_at: string | null;
      };
      const member = reportMap.get(row.employee_id);
      return {
        id: row.id,
        employeeId: row.employee_id,
        employeeName: member?.name ?? "Direct Report",
        employeeInitials: member?.initials ?? "DR",
        employeeJobTitle: member?.jobTitle ?? "Staff",
        workDate: row.work_date,
        undertimeType: row.undertime_type ?? "early_out",
        scheduledIn: row.scheduled_in ?? null,
        scheduledOut: row.scheduled_out,
        requestedIn: row.requested_in ?? null,
        requestedOut: row.requested_out,
        undertimeMinutes: row.undertime_minutes,
        reason: row.reason,
        coverageNotes: row.coverage_notes ?? null,
        deductionMode: row.deduction_mode ?? "payroll_deduction",
        createdAt: row.created_at ?? null,
      };
    });
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          eyebrow="Step 1 · Immediate Supervisor"
          title="Team Approvals — Undertime"
          subtitle="Review operational coverage notes and sign off direct reports' undertime requests"
          className="min-h-0 py-5"
        />
        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-10">
          <SupervisorUndertimeQueue items={undertimeItems} />
        </div>
      </div>
    </PageContainer>
  );
}
