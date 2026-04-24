import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { LeaveRequest, LeaveBalance, Profile } from "@/lib/types";
import { LEAVE_STATUS_COLORS } from "@/lib/types";
import Link from "next/link";
import { reviewLeaveRequest, cancelLeaveRequest } from "./actions";

interface Props {
  searchParams: Promise<{ error?: string; success?: string }>;
}

export default async function LeavesPage({ searchParams }: Props) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Profile>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";

  const params  = await searchParams;
  const error   = params.error ?? null;
  const success = params.success ?? null;

  let leaveRequests: LeaveRequest[] = [];
  let balances: LeaveBalance[] = [];

  if (isHR) {
    const { data } = await supabase
      .from("leave_requests")
      .select("*, employees(id, job_title, profiles(first_name, last_name))")
      .order("filed_at", { ascending: false });
    leaveRequests = (data as LeaveRequest[]) ?? [];
  } else {
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!employee) redirect("/dashboard");

    const [{ data: leaves }, { data: bal }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employee.id)
        .order("filed_at", { ascending: false }),
      supabase
        .from("leave_balances")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("year", new Date().getFullYear()),
    ]);
    leaveRequests = (leaves as LeaveRequest[]) ?? [];
    balances      = (bal as LeaveBalance[]) ?? [];
  }

  const pending = leaveRequests.filter((l) => l.status === "pending");

  return (
    <PageContainer>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              {isHR ? "Leave requests" : "My leaves"}
            </h1>
          </div>
          {!isHR && (
            <Link
              href="/leaves/new"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              File leave
            </Link>
          )}
        </div>

        {/* Toast banners */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
          </div>
        )}
        {success && (
          <div className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-700">{decodeURIComponent(success)}</p>
          </div>
        )}

        {/* Leave balance cards — employee only */}
        {!isHR && balances.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {balances.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl bg-surface border border-border p-3 text-center"
              >
                <p className="text-xl font-bold text-text-primary">{b.remaining}</p>
                <p className="text-xs text-text-secondary mt-0.5 capitalize">
                  {b.leave_type.replace("_", " ")} days left
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Pending banner — HR only */}
        {isHR && pending.length > 0 && (
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4 flex items-center justify-between">
            <p className="text-sm font-medium text-yellow-800">
              {pending.length} request{pending.length > 1 ? "s" : ""} pending approval
            </p>
            <span className="rounded-full bg-yellow-200 px-3 py-1 text-sm font-bold text-yellow-800">
              {pending.length}
            </span>
          </div>
        )}

        {/* Leave list */}
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border p-6 text-center space-y-3">
              <p className="text-sm text-text-secondary">No leave requests yet</p>
              {!isHR && (
                <Link
                  href="/leaves/new"
                  className="inline-block rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  File your first leave
                </Link>
              )}
            </div>
          ) : (
            leaveRequests.map((leave) => (
              <LeaveCard
                key={leave.id}
                leave={leave}
                isHR={isHR}
              />
            ))
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function LeaveCard({ leave, isHR }: { leave: LeaveRequest; isHR: boolean }) {
  const emp = leave.employees as unknown as {
    profiles?: { first_name: string; last_name: string };
    job_title?: string;
  };
  const name = emp?.profiles
    ? `${emp.profiles.first_name} ${emp.profiles.last_name}`
    : null;

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          {isHR && name && (
            <p className="text-sm font-semibold text-text-primary">{name}</p>
          )}
          {isHR && emp?.job_title && (
            <p className="text-xs text-text-tertiary mb-0.5">{emp.job_title}</p>
          )}
          <p className={`text-sm capitalize font-medium ${isHR ? "text-text-secondary" : "text-text-primary"}`}>
            {leave.leave_type.replace("_", " ")} leave
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {new Date(leave.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
            {" — "}
            {new Date(leave.end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
            {" · "}{leave.total_days} day{leave.total_days !== 1 ? "s" : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAVE_STATUS_COLORS[leave.status]}`}>
          {leave.status}
        </span>
      </div>

      {/* Reason */}
      {leave.reason && (
        <p className="text-xs text-text-secondary bg-gray-50 rounded-xl px-3 py-2">
          {leave.reason}
        </p>
      )}

      {/* HR remarks */}
      {leave.hr_remarks && (
        <p className="text-xs text-text-secondary italic border-l-2 border-border pl-3">
          HR: {leave.hr_remarks}
        </p>
      )}

      {/* HR approve/reject — uses server action with optional remarks */}
      {isHR && leave.status === "pending" && (
        <div className="space-y-2 pt-1">
          <form action={reviewLeaveRequest} className="flex gap-2">
            <input type="hidden" name="leave_id" value={leave.id} />
            <input
              type="text"
              name="hr_remarks"
              placeholder="Remarks (optional)"
              className="flex-1 rounded-xl border border-border px-3 py-2 text-xs outline-none focus:border-primary"
            />
            <button
              type="submit"
              name="action"
              value="approved"
              className="rounded-xl bg-green-500 px-4 py-2 text-xs font-semibold text-white hover:bg-green-600 transition-colors"
            >
              Approve
            </button>
            <button
              type="submit"
              name="action"
              value="rejected"
              className="rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
            >
              Reject
            </button>
          </form>
        </div>
      )}

      {/* Employee cancel button */}
      {!isHR && leave.status === "pending" && (
        <form action={cancelLeaveRequest}>
          <input type="hidden" name="leave_id" value={leave.id} />
          <button
            type="submit"
            className="w-full rounded-xl border border-border py-2 text-xs font-medium text-text-secondary hover:bg-gray-50 transition-colors"
          >
            Cancel request
          </button>
        </form>
      )}
    </div>
  );
}