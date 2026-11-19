import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { LeaveRequest, LeaveBalance, Profile } from "@/lib/types";
import { LEAVE_STATUS_COLORS } from "@/lib/types";
import Link from "next/link";
import { reviewLeaveRequest, cancelLeaveRequest } from "./actions";
import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import { resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";

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

    if (!employee) redirect("/applicant/dashboard");

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
  const approved = leaveRequests.filter((l) => l.status === "approved");
  const totalLeaveCredits = balances.reduce((sum, b) => sum + (b.remaining ?? 0), 0);
  const vlRemaining = balances.find((b) => String(b.leave_type).toLowerCase() === "vacation")?.remaining ?? 0;
  const slRemaining = balances.find((b) => String(b.leave_type).toLowerCase() === "sick")?.remaining ?? 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          title="Leave Requests"
          subtitle="Track your leave balances and request time off"
          actions={
            !isHR ? (
              <Link
                href="/employee/leaves/new"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#1E1B4B] transition-colors hover:bg-indigo-50"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Request Leave
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-white/20 bg-white p-4 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Leave Credits
              </p>
              <p className="mt-1 text-2xl font-bold text-[#1E1B4B]">{totalLeaveCredits}d</p>
              <p className="mt-0.5 text-xs text-slate-500">
                VL {vlRemaining}d · SL {slRemaining}d
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-4 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Pending Requests
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</p>
              <p className="mt-0.5 text-xs text-slate-500">Awaiting HR review</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/20 bg-white p-4 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Approved Requests
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{approved.length}</p>
              <p className="mt-0.5 text-xs text-slate-500">Confirmed time off</p>
            </div>
          </div>
        </PwaHeroBanner>

        <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 sm:px-6 lg:px-10">

        {/* ── Toast banners ── */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-red-500">error</span>
            <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-green-500">check_circle</span>
            <p className="text-sm text-green-700">{decodeURIComponent(success)}</p>
          </div>
        )}

        {/* ── HR: pending banner ── */}
        {isHR && pending.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-600">pending_actions</span>
              <p className="text-sm font-medium text-amber-800">
                {pending.length} request{pending.length > 1 ? "s" : ""} awaiting approval
              </p>
            </div>
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-800">
              {pending.length}
            </span>
          </div>
        )}

        {/* ── Leave list ── */}
        <div className="space-y-3">
          {leaveRequests.length === 0 ? (
            <SolidSurfaceCard className="border-dashed p-8 text-center">
              <span className="material-symbols-outlined mb-2 text-[32px] text-text-secondary opacity-40">
                event_note
              </span>
              <p className="text-sm font-medium text-[#1E1B4B]">No leave requests yet</p>
              {!isHR && (
                <Link
                  href="/employee/leaves/new"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1E1B4B]/90"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  File your first leave
                </Link>
              )}
            </SolidSurfaceCard>
          ) : (
            leaveRequests.map((leave) => (
              <LeaveCard key={leave.id} leave={leave} isHR={isHR} />
            ))
          )}
        </div>
        </div>
      </div>
    </PageContainer>
  );
}

function LeaveCard({ leave, isHR }: { leave: LeaveRequest; isHR: boolean }) {
  const emp  = leave.employees as unknown as {
    profiles?: { first_name: string; last_name: string };
    job_title?: string;
  };
  const name = emp?.profiles ? `${emp.profiles.first_name} ${emp.profiles.last_name}` : null;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="rounded-2xl border border-[#e6e4f0] bg-white shadow-[0_2px_8px_rgba(39,36,84,0.04)]">
      {/* Top section */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {isHR && name && (
              <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
            )}
            {isHR && emp?.job_title && (
              <p className="text-xs text-text-secondary">
                {resolveEmployeeSourceOfTruth({ employee: { job_title: emp.job_title } }).position}
              </p>
            )}
            <p className={`text-sm font-semibold capitalize ${isHR ? "mt-1 text-text-secondary" : "text-text-primary"}`}>
              {leave.leave_type.replace("_", " ")} leave
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {fmt(leave.start_date)} – {fmt(leave.end_date)}
              <span className="mx-1">·</span>
              {leave.total_days} day{leave.total_days !== 1 ? "s" : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-normal break-words leading-normal max-w-[50%] text-center ${LEAVE_STATUS_COLORS[leave.status]}`}>
            {leave.status}
          </span>
        </div>

        {/* Reason */}
        {leave.reason && (
          <p className="mt-3 rounded-xl bg-[#f7f6fc] px-3 py-2 text-xs text-text-secondary">
            {leave.reason}
          </p>
        )}

        {/* HR remarks */}
        {leave.hr_remarks && (
          <p className="mt-2 border-l-2 border-[#e6e4f0] pl-3 text-xs italic text-text-secondary">
            HR: {leave.hr_remarks}
          </p>
        )}
      </div>

      {/* HR approve/reject actions */}
      {isHR && leave.status === "pending" && (
        <div className="border-t border-[#e6e4f0] px-4 py-3">
          <form action={reviewLeaveRequest} className="flex gap-2">
            <input type="hidden" name="leave_id" value={leave.id} />
            <input
              type="text"
              name="hr_remarks"
              placeholder="Remarks (optional)"
              className="min-w-0 flex-1 rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3 py-2 text-xs outline-none transition-colors focus:border-primary focus:bg-white"
            />
            <button
              type="submit"
              name="action"
              value="approved"
              className="rounded-xl bg-green-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-600"
            >
              Approve
            </button>
            <button
              type="submit"
              name="action"
              value="rejected"
              className="rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"
            >
              Reject
            </button>
          </form>
        </div>
      )}

      {/* Employee cancel button */}
      {!isHR && leave.status === "pending" && (
        <div className="border-t border-[#e6e4f0] px-4 py-3">
          <form action={cancelLeaveRequest}>
            <input type="hidden" name="leave_id" value={leave.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-[#e6e4f0] py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-[#f7f6fc]"
            >
              Cancel request
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
