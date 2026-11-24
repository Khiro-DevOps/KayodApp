import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import PageContainer from "@/components/ui/page-container";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import { normalizeJobLevel } from "@/lib/workforce-hierarchy";
import {
  resolveDailyWorkModel,
  type DailyWorkModel,
} from "@/lib/work-arrangement";
import { parseHybridScheduleNotes } from "@/lib/hybrid-schedule";
import TeamHubClient, {
  type TeamApprovalItem,
  type TeamDirectReport,
} from "./team-hub-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "My Team | Kayod",
  description: "View your direct reports, today's work mode, and team schedule",
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function normalizeWorkMode(workMode?: string | null): "onsite" | "hybrid" | "wfh" {
  const raw = (workMode || "onsite").trim().toLowerCase();
  if (raw === "hybrid") return "hybrid";
  if (raw === "wfh" || raw === "remote") return "wfh";
  return "onsite";
}

export default async function EmployeeTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = getAdminClient();

  const { data: myEmployee, error: myEmployeeError } = await admin
    .from("employees")
    .select("id, tenant_id, job_title, job_level")
    .eq("profile_id", user.id)
    .eq("employment_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      tenant_id: string | null;
      job_title?: string | null;
      job_level?: string | null;
    }>();

  if (myEmployeeError) {
    console.error("EmployeeTeamPage myEmployee query error:", myEmployeeError);
  }

  if (!myEmployee) {
    redirect("/employee/dashboard");
  }

  let directReportsRaw: unknown[] | null = null;
  let directReportsError: { message: string } | null = null;

  let primaryEmpQuery = admin
    .from("employees")
    .select(
      `id, employee_number, job_title, job_level, work_mode, shift_start, shift_end, work_days, daily_work_modes, job_offer_id, employment_status, department_id, department:departments!department_id(name), profile:profiles!profile_id(first_name, last_name, email)`,
    )
    .eq("reports_to", myEmployee.id)
    .eq("employment_status", "active");
  if (myEmployee.tenant_id) {
    primaryEmpQuery = primaryEmpQuery.eq("tenant_id", myEmployee.tenant_id);
  }
  const primaryEmpRes = await primaryEmpQuery;

  if (primaryEmpRes.error && /daily_work_modes/i.test(primaryEmpRes.error.message)) {
    let fallbackEmpQuery = admin
      .from("employees")
      .select(
        `id, employee_number, job_title, job_level, work_mode, shift_start, shift_end, work_days, job_offer_id, employment_status, department_id, department:departments!department_id(name), profile:profiles!profile_id(first_name, last_name, email)`,
      )
      .eq("reports_to", myEmployee.id)
      .eq("employment_status", "active");
    if (myEmployee.tenant_id) {
      fallbackEmpQuery = fallbackEmpQuery.eq("tenant_id", myEmployee.tenant_id);
    }
    const fallbackEmpRes = await fallbackEmpQuery;
    directReportsRaw = fallbackEmpRes.data;
    directReportsError = fallbackEmpRes.error;
  } else {
    directReportsRaw = primaryEmpRes.data;
    directReportsError = primaryEmpRes.error;
  }

  if (directReportsError) {
    console.error("EmployeeTeamPage directReports query error:", directReportsError);
  }

  const todayPht = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });

  const directReportIds = (directReportsRaw ?? []).map(
    (row) => (row as { id: string }).id,
  );

  const overrideByEmpId = new Map<
    string,
    { override_mode: "onsite" | "wfh"; reason: string }
  >();
  const latestScheduleByEmpId = new Map<
    string,
    {
      shift_start?: string | null;
      shift_end?: string | null;
      work_days?: string[] | null;
      notes?: string | null;
      mon?: string | null;
      tue?: string | null;
      wed?: string | null;
      thu?: string | null;
      fri?: string | null;
      sat?: string | null;
      sun?: string | null;
    }
  >();

  if (directReportIds.length > 0) {
    const [{ data: overridesData, error: overridesErr }, { data: schedulesData }] =
      await Promise.all([
        admin
          .from("employee_work_mode_overrides")
          .select("employee_id, override_mode, reason")
          .in("employee_id", directReportIds)
          .eq("effective_date", todayPht),
        admin
          .from("schedules")
          .select(
            "employee_id, shift_start, shift_end, work_days, notes, mon, tue, wed, thu, fri, sat, sun",
          )
          .in("employee_id", directReportIds)
          .eq("is_published", true)
          .order("week_start", { ascending: false })
          .order("updated_at", { ascending: false }),
      ]);

    if (overridesErr) {
      console.error(
        "EmployeeTeamPage overrides query warning:",
        overridesErr.message,
      );
    }

    for (const ov of overridesData ?? []) {
      const row = ov as {
        employee_id?: string | null;
        override_mode?: string | null;
        reason?: string | null;
      };
      const mode = row.override_mode?.trim().toLowerCase();
      if (row.employee_id && (mode === "onsite" || mode === "wfh")) {
        overrideByEmpId.set(row.employee_id, {
          override_mode: mode,
          reason: row.reason ?? "",
        });
      }
    }

    for (const sched of schedulesData ?? []) {
      const row = sched as {
        employee_id?: string | null;
        shift_start?: string | null;
        shift_end?: string | null;
        work_days?: string[] | null;
        notes?: string | null;
        mon?: string | null;
        tue?: string | null;
        wed?: string | null;
        thu?: string | null;
        fri?: string | null;
        sat?: string | null;
        sun?: string | null;
      };
      if (row.employee_id && !latestScheduleByEmpId.has(row.employee_id)) {
        latestScheduleByEmpId.set(row.employee_id, row);
      }
    }
  }

  const directReports: TeamDirectReport[] = (directReportsRaw ?? []).map(
    (row) => {
      const r = row as {
        id: string;
        employee_number?: string | null;
        job_title?: string | null;
        job_level?: string | null;
        work_mode?: string | null;
        shift_start?: string | null;
        shift_end?: string | null;
        work_days?: string[] | null;
        daily_work_modes?: Record<string, "onsite" | "wfh" | "rest"> | null;
        employment_status?: string | null;
        department_id?: string | null;
        department?:
          | { name?: string | null }
          | Array<{ name?: string | null }>
          | null;
        profile?:
          | {
              first_name?: string | null;
              last_name?: string | null;
              email?: string | null;
            }
          | Array<{
              first_name?: string | null;
              last_name?: string | null;
              email?: string | null;
            }>
          | null;
      };

      const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
      const dept = Array.isArray(r.department)
        ? r.department[0]
        : r.department;

      const fullName =
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
        "Employee";

      const contractWorkMode = normalizeWorkMode(r.work_mode);
      const sched = latestScheduleByEmpId.get(r.id);
      const parsedHybrid = parseHybridScheduleNotes(sched?.notes);
      const override = overrideByEmpId.get(r.id);

      const scheduledTodayModel: DailyWorkModel = resolveDailyWorkModel({
        contractWorkSetup: contractWorkMode,
        schedule: sched
          ? {
              mon: sched.mon,
              tue: sched.tue,
              wed: sched.wed,
              thu: sched.thu,
              fri: sched.fri,
              sat: sched.sat,
              sun: sched.sun,
              work_days: sched.work_days,
              notes: sched.notes,
            }
          : null,
      });

      const todayWorkMode: DailyWorkModel = override
        ? override.override_mode
        : scheduledTodayModel;

      return {
        id: r.id,
        employeeNumber: r.employee_number?.trim() || "—",
        fullName,
        initials: getInitials(fullName),
        email: prof?.email ?? null,
        jobTitle: r.job_title ?? "Staff",
        jobLevel: normalizeJobLevel(r.job_level),
        workMode: contractWorkMode,
        todayWorkMode,
        isEmergencyOverride: Boolean(override),
        overrideReason: override?.reason ?? null,
        hybridOnsiteDays: parsedHybrid?.onsiteDays ?? [],
        shiftStart: sched?.shift_start ?? r.shift_start ?? "08:00",
        shiftEnd: sched?.shift_end ?? r.shift_end ?? "17:00",
        workDays:
          Array.isArray(sched?.work_days) && sched.work_days.length > 0
            ? sched.work_days
            : Array.isArray(r.work_days)
              ? r.work_days
              : [],
        dailyWorkModes:
          r.daily_work_modes && typeof r.daily_work_modes === "object"
            ? r.daily_work_modes
            : undefined,
        employmentStatus: r.employment_status ?? "active",
        departmentName: dept?.name ?? null,
      };
    },
  );

  const onsiteCount = directReports.filter((r) => r.workMode === "onsite").length;
  const wfhHybridCount = directReports.filter(
    (r) => r.workMode === "wfh" || r.workMode === "hybrid",
  ).length;

  // Phase 2: Fetch pending Leave & Overtime requests from direct reports for Supervisor Queue
  const reportById = new Map(directReports.map((r) => [r.id, r]));
  const pendingApprovals: TeamApprovalItem[] = [];

  if (directReportIds.length > 0) {
    const [
      { data: pendingLeaves, error: leavesErr },
      { data: pendingOts, error: otsErr },
      { data: pendingWorkModes, error: wmErr },
    ] = await Promise.all([
      admin
        .from("leave_requests")
        .select("*")
        .in("employee_id", directReportIds)
        .in("status", ["pending_supervisor", "pending"])
        .order("filed_at", { ascending: false }),
      admin
        .from("overtime_requests")
        .select("*")
        .in("employee_id", directReportIds)
        .in("status", ["pending_supervisor", "pending"])
        .order("created_at", { ascending: false }),
      admin
        .from("work_mode_requests")
        .select("id, employee_id, request_date, requested_mode, reason, status, created_at")
        .in("employee_id", directReportIds)
        .eq("status", "pending_supervisor")
        .order("created_at", { ascending: false }),
    ]);

    if (leavesErr) {
      console.error("EmployeeTeamPage pendingLeaves query error:", leavesErr.message);
    }
    if (otsErr) {
      console.error("EmployeeTeamPage pendingOts query error:", otsErr.message);
    }
    if (wmErr) {
      console.warn("EmployeeTeamPage pendingWorkModes query warning:", wmErr.message);
    }

    for (const row of pendingLeaves ?? []) {
      const l = row as {
        id: string;
        employee_id: string;
        leave_type: string;
        start_date: string;
        end_date: string;
        total_days?: number | null;
        reason?: string | null;
        status: string;
        supervisor_action_at?: string | null;
        requires_document_verification?: boolean | null;
        filed_at?: string | null;
      };
      if (l.supervisor_action_at) continue;
      const member = reportById.get(l.employee_id);
      const startMs = Date.parse(`${l.start_date}T00:00:00Z`);
      const endMs = Date.parse(`${l.end_date}T00:00:00Z`);
      const days =
        typeof l.total_days === "number" && l.total_days > 0
          ? l.total_days
          : Number.isFinite(startMs) && Number.isFinite(endMs)
            ? Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1)
            : 1;
      pendingApprovals.push({
        id: l.id,
        kind: "leave",
        employeeId: l.employee_id,
        employeeName: member?.fullName ?? "Direct Report",
        employeeInitials: member?.initials ?? "DR",
        employeeJobTitle: member?.jobTitle ?? "Staff",
        badgeLabel: `${String(l.leave_type ?? "Leave").replace(/_/g, " ")} (${days}d)`,
        dateRangeLabel:
          l.start_date === l.end_date
            ? l.start_date
            : `${l.start_date} → ${l.end_date}`,
        reason: l.reason ?? null,
        requiresDocVerification: Boolean(l.requires_document_verification),
        createdAt: l.filed_at ?? null,
      });
    }

    for (const row of pendingOts ?? []) {
      const o = row as {
        id: string;
        employee_id: string;
        work_date: string;
        start_time: string;
        end_time: string;
        overtime_type?: string | null;
        reason?: string | null;
        status: string;
        supervisor_action_at?: string | null;
        created_at?: string | null;
      };
      if (o.supervisor_action_at) continue;
      const member = reportById.get(o.employee_id);
      const isRdot = o.overtime_type === "rdot";
      pendingApprovals.push({
        id: o.id,
        kind: "overtime",
        employeeId: o.employee_id,
        employeeName: member?.fullName ?? "Direct Report",
        employeeInitials: member?.initials ?? "DR",
        employeeJobTitle: member?.jobTitle ?? "Staff",
        badgeLabel: `${isRdot ? "RDOT (1.30x)" : "Regular OT (1.25x)"} · ${o.start_time.slice(0, 5)}–${o.end_time.slice(0, 5)}`,
        dateRangeLabel: o.work_date,
        reason: o.reason ?? null,
        requiresDocVerification: false,
        overtimeType: isRdot ? "rdot" : "regular_ot",
        createdAt: o.created_at ?? null,
      });
    }

    for (const row of pendingWorkModes ?? []) {
      const w = row as {
        id: string;
        employee_id: string;
        request_date: string;
        requested_mode: "onsite" | "wfh";
        reason?: string | null;
        created_at?: string | null;
      };
      const member = reportById.get(w.employee_id);
      pendingApprovals.push({
        id: w.id,
        kind: "work_mode",
        employeeId: w.employee_id,
        employeeName: member?.fullName ?? "Direct Report",
        employeeInitials: member?.initials ?? "DR",
        employeeJobTitle: member?.jobTitle ?? "Staff",
        badgeLabel: `Work Mode → ${w.requested_mode === "wfh" ? "WFH" : "Onsite"}`,
        dateRangeLabel: w.request_date,
        reason: w.reason ?? null,
        requiresDocVerification: false,
        createdAt: w.created_at ?? null,
      });
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          eyebrow="Team Hub"
          title="My Team"
          subtitle="Manage your direct reports, today's work mode, and team schedule"
          className="min-h-0 py-5 sm:py-6"
          actions={
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 w-full sm:w-auto">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                  Direct Reports
                </p>
                <p className="mt-0.5 text-lg font-bold text-white leading-tight">
                  {directReports.length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                  Onsite
                </p>
                <p className="mt-0.5 text-lg font-bold text-white leading-tight">
                  {onsiteCount}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">
                  WFH / Hybrid
                </p>
                <p className="mt-0.5 text-lg font-bold text-white leading-tight">
                  {wfhHybridCount}
                </p>
              </div>
            </div>
          }
        />

        <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 sm:px-6 lg:px-10">
          <TeamHubClient
            directReports={directReports}
            pendingApprovals={pendingApprovals}
            queryError={directReportsError?.message ?? null}
            todayDateLabel={todayPht}
          />
        </div>
      </div>
    </PageContainer>
  );
}
