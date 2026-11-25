import { getAdminClient } from "@/lib/supabase/admin";
import { requireHrPermission } from "@/lib/rbac/server";
import PageContainer from "@/components/ui/page-container";
import { PageHeroHeader } from "@/components/ui/option-b-surfaces";
import HrUndertimeQueue, {
  type HrUndertimeItem,
} from "@/components/undertime/HrUndertimeQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "HR Approvals — Undertime | Kayod HR",
  description: "Verify supervisor-approved undertime requests and log them for payroll",
};

export default async function HrApprovalsPage() {
  const ctx = await requireHrPermission("attendance:view");
  const admin = getAdminClient();
  const tenantId = ctx.tenant_id ?? null;

  let utQuery = admin
    .from("undertime_requests")
    .select(
      "id, tenant_id, employee_id, work_date, undertime_type, scheduled_in, scheduled_out, requested_in, requested_out, undertime_minutes, leave_credits_deducted, reason, coverage_notes, deduction_mode, status, supervisor_acted_at, hr_acted_at, rejection_reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (tenantId) {
    utQuery = utQuery.eq("tenant_id", tenantId);
  }
  const { data: rawUtRows } = await utQuery;

  const empIds = Array.from(
    new Set((rawUtRows ?? []).map((u) => (u as { employee_id: string }).employee_id).filter(Boolean))
  );
  const empMap = new Map<string, { name: string; jobTitle: string | null }>();
  if (empIds.length > 0) {
    const { data: emps } = await admin
      .from("employees")
      .select("id, job_title, profiles ( first_name, last_name )")
      .in("id", empIds);
    for (const e of emps ?? []) {
      const row = e as {
        id: string;
        job_title: string | null;
        profiles:
          | { first_name: string | null; last_name: string | null }
          | Array<{ first_name: string | null; last_name: string | null }>
          | null;
      };
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const name =
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || "Employee";
      empMap.set(row.id, { name, jobTitle: row.job_title ?? null });
    }
  }

  const items: HrUndertimeItem[] = (rawUtRows ?? []).map((r) => {
    const row = r as {
      id: string;
      employee_id: string;
      work_date: string;
      undertime_type?: HrUndertimeItem["undertimeType"];
      scheduled_in?: string | null;
      scheduled_out: string;
      requested_in?: string | null;
      requested_out: string | null;
      undertime_minutes: number;
      leave_credits_deducted?: number | null;
      reason: string;
      coverage_notes: string | null;
      deduction_mode: "payroll_deduction" | "leave_offset";
      status: HrUndertimeItem["status"];
      supervisor_acted_at: string | null;
      hr_acted_at: string | null;
      rejection_reason: string | null;
      created_at: string;
    };
    const info = empMap.get(row.employee_id);
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: info?.name ?? "Employee",
      employeeJobTitle: info?.jobTitle ?? null,
      workDate: row.work_date,
      undertimeType: row.undertime_type ?? "early_out",
      scheduledIn: row.scheduled_in ?? null,
      scheduledOut: row.scheduled_out,
      requestedIn: row.requested_in ?? null,
      requestedOut: row.requested_out,
      undertimeMinutes: row.undertime_minutes,
      leaveCreditsDeducted: Number(row.leave_credits_deducted ?? 0),
      reason: row.reason,
      coverageNotes: row.coverage_notes ?? null,
      deductionMode: row.deduction_mode ?? "payroll_deduction",
      status: row.status,
      supervisorActedAt: row.supervisor_acted_at ?? null,
      hrActedAt: row.hr_acted_at ?? null,
      rejectionReason: row.rejection_reason ?? null,
      createdAt: row.created_at,
    };
  });

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeroHeader
          eyebrow="Step 2 · HR / Timekeeping / Payroll"
          title="Undertime Verification & Payroll Logging"
          subtitle="Verify supervisor sign-off, undertime minutes, and deduction mode before payroll run"
        />
        <HrUndertimeQueue items={items} />
      </div>
    </PageContainer>
  );
}
