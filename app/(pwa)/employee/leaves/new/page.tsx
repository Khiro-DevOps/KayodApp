import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import LeaveRequestForm from "./leave-request-form";

interface Props {
  searchParams: Promise<{ date?: string; error?: string }>;
}

export default async function NewLeavePage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "hr_manager" || profile?.role === "admin") {
    redirect("/hr");
  }

  const admin = getAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, reports_to, employment_status, probation_end_date")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      reports_to: string | null;
      employment_status: string | null;
      probation_end_date: string | null;
    }>();

  if (!employee) {
    redirect("/employee/dashboard");
  }

  const currentYear = new Date().getFullYear();

  const [{ data: ledgerRows }, { data: legacyRows }, { data: supervisorRow }] =
    await Promise.all([
      admin
        .from("employee_leave_balances")
        .select("leave_type, entitled_days, used_days, pending_days, eligibility")
        .eq("employee_id", employee.id)
        .eq("year", currentYear)
        .eq("is_active", true),
      supabase
        .from("leave_balances")
        .select("leave_type, total_credits, used_credits, remaining")
        .eq("employee_id", employee.id)
        .eq("year", currentYear),
      employee.reports_to
        ? admin
            .from("employees")
            .select("id, job_title, profile:profiles!profile_id(first_name, last_name)")
            .eq("id", employee.reports_to)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const ledger = (ledgerRows ?? []) as Array<{
    leave_type: string;
    entitled_days: number;
    used_days: number;
    pending_days: number;
    eligibility: string;
  }>;
  const legacy = (legacyRows ?? []) as Array<{
    leave_type: string;
    total_credits: number;
    used_credits: number;
    remaining: number;
  }>;

  const getPool = (code: "VL" | "SL" | "SIL", legacyKey: string) => {
    const row = ledger.find((r) => r.leave_type === code);
    if (row) {
      const entitled = Number(row.entitled_days ?? 0);
      const used = Number(row.used_days ?? 0);
      const pending = Number(row.pending_days ?? 0);
      return {
        exists: true,
        entitled,
        used,
        pending,
        available: Math.max(0, entitled - used - pending),
        eligibility: row.eligibility ?? "upon_regularization",
      };
    }
    const leg = legacy.find(
      (r) => String(r.leave_type).toLowerCase() === legacyKey
    );
    if (leg) {
      return {
        exists: true,
        entitled: Number(leg.total_credits ?? 0),
        used: Number(leg.used_credits ?? 0),
        pending: 0,
        available: Math.max(0, Number(leg.remaining ?? 0)),
        eligibility: "day_1",
      };
    }
    return {
      exists: false,
      entitled: 0,
      used: 0,
      pending: 0,
      available: 0,
      eligibility: "upon_regularization",
    };
  };

  const vl = getPool("VL", "vacation");
  const sl = getPool("SL", "sick");
  const sil = getPool("SIL", "sil");

  const supProfile = supervisorRow
    ? Array.isArray((supervisorRow as { profile?: unknown }).profile)
      ? ((supervisorRow as { profile?: Array<{ first_name?: string | null; last_name?: string | null }> }).profile?.[0] ?? null)
      : ((supervisorRow as { profile?: { first_name?: string | null; last_name?: string | null } | null }).profile ?? null)
    : null;
  const supervisorName = supProfile
    ? [supProfile.first_name, supProfile.last_name].filter(Boolean).join(" ").trim() || null
    : null;

  const todayPht = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const empStatus = String(employee.employment_status ?? "").trim().toLowerCase();
  const isProbationary =
    empStatus === "probationary" ||
    empStatus === "onboarding" ||
    Boolean(
      employee.probation_end_date &&
        String(employee.probation_end_date).slice(0, 10) > todayPht
    );

  const params = await searchParams;
  const prefill = params.date ?? "";
  const error = params.error ?? null;

  const showSilTile = sil.exists || (!vl.exists && !sl.exists);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
      {/* Kayod Signature Indigo Hero Card */}
      <section className="rounded-[2rem] bg-[#1E1B4B] p-6 sm:p-8 text-white shadow-sm">
        <div className="space-y-3">
          <Link
            href="/employee/leaves"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100 transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Leaves
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              File a Leave Request
            </h1>
            <p className="mt-1 text-sm text-indigo-200">
              {supervisorName
                ? `Routes to ${supervisorName} → HR`
                : "Routes directly to HR"}
            </p>
          </div>
        </div>

        {/* Live Remaining Balance Tiles */}
        <div
          className={`mt-6 grid grid-cols-1 gap-3 ${
            showSilTile ? "sm:grid-cols-3" : "sm:grid-cols-2"
          }`}
        >
          <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vacation Leave (VL)
            </p>
            <p className="mt-1 text-2xl font-bold text-[#1E1B4B]">
              {vl.available}d
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {vl.exists
                ? `${vl.entitled} entitled · ${vl.used} used · ${vl.pending} pending`
                : "Not enrolled in VL pool"}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Sick Leave (SL)
            </p>
            <p className="mt-1 text-2xl font-bold text-[#1E1B4B]">
              {sl.available}d
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {sl.exists
                ? `${sl.entitled} entitled · ${sl.used} used · ${sl.pending} pending`
                : "Not enrolled in SL pool"}
            </p>
          </div>

          {showSilTile && (
            <div className="bg-white rounded-2xl p-4 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Service Incentive Leave (SIL)
              </p>
              <p className="mt-1 text-2xl font-bold text-[#1E1B4B]">
                {sil.available}d
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {sil.exists
                  ? `${sil.entitled} entitled · ${sil.used} used · ${sil.pending} pending`
                  : "Labor Code Art. 95"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-medium text-rose-700 shadow-xs">
          {decodeURIComponent(error)}
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <LeaveRequestForm
            prefillDate={prefill}
            isProbationary={isProbationary}
            eligibilityMap={{
              VL: vl.eligibility,
              SL: sl.eligibility,
              SIL: sil.eligibility,
            }}
            balances={{
              vlAvailable: vl.available,
              slAvailable: sl.available,
              silAvailable: sil.available,
              hasVl: vl.exists,
              hasSl: sl.exists,
              hasSil: sil.exists,
            }}
          />
        </div>

        {/* Right: Approval & Policy Summary Card */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Approval &amp; Policy Summary
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                How your request is reviewed and tracked.
              </p>
            </div>

            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    supervisorName
                      ? "bg-indigo-100 text-[#1E1B4B]"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  1
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                    Direct Supervisor
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {supervisorName
                      ? `${supervisorName} reviews team coverage and forwards to HR.`
                      : "No direct supervisor assigned — skipped automatically."}
                  </p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  2
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    HR Final Approval
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    HR finalizes approval, updates your leave ledger, and syncs
                    your schedule.
                  </p>
                </div>
              </li>
            </ol>

            <div className="border-t border-slate-100 pt-3.5 space-y-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#1E1B4B]" />
                PH Statutory &amp; Balance Rules
              </p>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-500 list-disc pl-4">
                <li>
                  VL, SL, and SIL credits are reserved as <strong>pending</strong>{" "}
                  on submit and automatically released if cancelled or rejected.
                </li>
                <li>
                  Special statutory leaves (Maternity, Paternity, Solo Parent,
                  VAWC, Magna Carta) do not deduct from your VL/SL pool and are
                  flagged for HR document verification.
                </li>
                <li>
                  Overlapping dates with existing pending or approved requests
                  are automatically blocked.
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
