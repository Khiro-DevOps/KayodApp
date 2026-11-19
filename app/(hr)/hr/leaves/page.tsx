import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { reviewLeaveRequest } from "@/app/(pwa)/employee/leaves/actions";
import { effectiveRole, isHRRole } from "@/lib/roles";
import { resolveEmployeePosition } from "@/lib/employee-position";
import { getJobPostingPositionsByProfileIds } from "@/lib/employee-position-server";
import { GlassStatTile, PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

type LeaveRequestWithEmployee = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  hr_remarks: string | null;
  filed_at?: string;
  created_at?: string;
  employees: {
    job_title: string | null;
    profiles: {
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
};

const LEAVE_TYPE_BADGES: Record<string, string> = {
  vacation:  "bg-primary-light text-primary-dark border-primary/20",
  sick:      "bg-error-bg text-error border-error/20",
  emergency: "bg-warning-bg text-warning border-warning/20",
  maternity: "bg-primary-light text-primary-dark border-primary/20",
  paternity: "bg-primary-light text-primary-dark border-primary/20",
  unpaid:    "bg-surface-bg text-text-muted border-border",
};

export default async function HRLeavesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const actionError = resolvedParams?.error ?? null;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) {
    redirect("/dashboard");
  }

  const admin = getAdminClient();
  const { data: initialRequests, error: requestsError } = await admin
    .from("leave_requests")
    .select("*")
    .order("filed_at", { ascending: false });

  let requests = initialRequests;
  if (requestsError) {
    const fallback = await admin.from("leave_requests").select("*");
    requests = fallback.data;
  }

  const rawRequests = (requests ?? []) as Array<
    Omit<LeaveRequestWithEmployee, "employees"> & { employee_id: string }
  >;

  const empIds = Array.from(
    new Set(rawRequests.map((r) => r.employee_id).filter(Boolean))
  );

  const empMap = new Map<
    string,
    { id: string; profile_id: string | null; job_title: string | null }
  >();
  if (empIds.length > 0) {
    const { data: empRows } = await admin
      .from("employees")
      .select("id, profile_id, job_title")
      .in("id", empIds);
    for (const emp of empRows ?? []) {
      empMap.set(emp.id, emp);
    }
  }

  const profileIds = Array.from(
    new Set(
      Array.from(empMap.values())
        .map((e) => e.profile_id)
        .filter((pid): pid is string => Boolean(pid))
    )
  );

  const profileMap = new Map<
    string,
    { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
  >();
  const jobPostingByProfileId = await getJobPostingPositionsByProfileIds(profileIds);
  if (profileIds.length > 0) {
    const { data: profRows } = await admin
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .in("id", profileIds);
    for (const prof of profRows ?? []) {
      profileMap.set(prof.id, prof);
    }
  }

  const leaveRequests: LeaveRequestWithEmployee[] = rawRequests.map((r) => {
    const emp = empMap.get(r.employee_id);
    const prof = emp?.profile_id ? profileMap.get(emp.profile_id) ?? null : null;
    const linkedJob = emp?.profile_id ? jobPostingByProfileId[emp.profile_id] : undefined;
    const resolvedPos = resolveEmployeePosition({
      employeePosition: emp?.job_title,
      jobTitle: linkedJob?.title,
    }).position;
    const normalizedStatus = String(r.status ?? "pending").toLowerCase() as LeaveRequestWithEmployee["status"];
    return {
      ...r,
      status: normalizedStatus,
      employees: emp
        ? {
            job_title: resolvedPos,
            profiles: prof
              ? {
                  first_name: prof.first_name ?? null,
                  last_name: prof.last_name ?? null,
                  avatar_url: prof.avatar_url ?? null,
                }
              : null,
          }
        : null,
    };
  });

  const pendingRequests = leaveRequests.filter(
    (r) => String(r.status ?? "pending").toLowerCase() === "pending"
  );
  const historyRequests = leaveRequests.filter(
    (r) => String(r.status ?? "pending").toLowerCase() !== "pending"
  );
  const reviewedRequests = historyRequests;

  const approvedCount = leaveRequests.filter(
    (r) => String(r.status ?? "").toLowerCase() === "approved"
  ).length;

  return (
    <PageContainer>
      <div className="space-y-7">
        {/* Header */}
        <PageHeroHeader
          eyebrow="Time Off"
          title="Leave Requests"
          subtitle="Review and manage employee leave applications"
        />

        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassStatTile
            icon={<span className="material-symbols-outlined text-[20px]">pending_actions</span>}
            label="Pending Approval"
            value={pendingRequests.length}
          />
          <GlassStatTile
            icon={<span className="material-symbols-outlined text-[20px]">check_circle</span>}
            label="Approved Leaves"
            value={approvedCount}
          />
          <GlassStatTile
            icon={<span className="material-symbols-outlined text-[20px]">event_note</span>}
            label="Total Processed"
            value={leaveRequests.length}
          />
        </div>

        {/* Pending Requests Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#1E1B4B] flex items-center gap-2">
            Pending Requests
            {pendingRequests.length > 0 && (
              <span className="rounded-full bg-warning-bg text-warning text-xs px-2.5 py-0.5 font-medium border border-warning/20">
                {pendingRequests.length}
              </span>
            )}
          </h2>

          {pendingRequests.length === 0 ? (
            <SolidSurfaceCard className="border-dashed p-6 text-center">
              <p className="text-sm text-text-muted">No pending leave requests to review.</p>
            </SolidSurfaceCard>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => {
                const empName = req.employees?.profiles
                  ? `${req.employees.profiles.first_name ?? ""} ${req.employees.profiles.last_name ?? ""}`.trim()
                  : "Employee";

                return (
                    <SolidSurfaceCard key={req.id} className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary-light text-primary-dark flex items-center justify-center font-bold text-sm">
                          {empName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-text-main">{empName}</p>
                          <p className="text-xs text-text-muted">{req.employees?.job_title ?? "Employee"}</p>
                        </div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${LEAVE_TYPE_BADGES[req.leave_type] ?? "bg-surface-bg text-text-muted border-border"}`}>
                        {req.leave_type}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-xl bg-surface-bg border border-border/50 p-3 text-xs">
                      <div>
                        <p className="text-text-muted">Start Date</p>
                        <p className="font-medium text-text-main mt-0.5">
                          {new Date(req.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">End Date</p>
                        <p className="font-medium text-text-main mt-0.5">
                          {new Date(req.end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Duration</p>
                        <p className="font-medium text-text-main mt-0.5">
                          {req.total_days} {req.total_days === 1 ? "day" : "days"}
                        </p>
                      </div>
                    </div>

                    {req.reason && (
                      <div className="text-xs text-text-muted bg-surface-bg border border-border/50 rounded-xl p-3">
                        <p className="font-medium text-text-main mb-0.5">Reason:</p>
                        <p className="italic">{req.reason}</p>
                      </div>
                    )}

                    {/* Decision Action Form */}
                    <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3">
                      <form action={reviewLeaveRequest} className="flex items-center gap-2 w-full sm:w-auto">
                        <input type="hidden" name="leave_id" value={req.id} />
                        <input
                          type="text"
                          name="hr_remarks"
                          placeholder="Optional remarks..."
                          className="rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-primary flex-1 sm:w-64 bg-white text-text-main"
                        />
                        <button
                          type="submit"
                          name="action"
                          value="approved"
                          className="rounded-lg bg-success px-4 py-1.5 text-xs font-semibold text-white hover:bg-success/90 transition-colors shadow-xs"
                        >
                          Approve
                        </button>
                        <button
                          type="submit"
                          name="action"
                          value="rejected"
                          className="rounded-lg bg-error px-4 py-1.5 text-xs font-semibold text-white hover:bg-error/90 transition-colors shadow-xs"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  </SolidSurfaceCard>
                );
              })}
            </div>
          )}
        </section>

        {/* Reviewed Requests History Section */}
        <section className="space-y-3 pt-4">
          <h2 className="text-sm font-semibold text-text-main">Leave History</h2>

          {reviewedRequests.length === 0 ? (
            <div className="rounded-xl bg-card-bg border border-dashed border-border p-6 text-center shadow-xs">
              <p className="text-sm text-text-muted">No leave history recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card-bg shadow-sm">
              {reviewedRequests.map((req) => {
                const empName = req.employees?.profiles
                  ? `${req.employees.profiles.first_name ?? ""} ${req.employees.profiles.last_name ?? ""}`.trim()
                  : "Employee";

                const statusBg =
                  req.status === "approved"
                    ? "bg-success-bg text-success border border-success/20"
                    : req.status === "rejected"
                    ? "bg-error-bg text-error border border-error/20"
                    : "bg-surface-bg text-text-muted border border-border";

                return (
                  <div key={req.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-bg/70 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-text-main">{empName}</p>
                      <p className="text-xs text-text-muted">
                        {req.leave_type.toUpperCase()} • {new Date(req.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - {new Date(req.end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} ({req.total_days} days)
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBg}`}>
                      {req.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
