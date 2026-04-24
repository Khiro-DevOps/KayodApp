import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import { fileLeaveRequest } from "../actions";

const LEAVE_TYPES = [
  { value: "vacation",   label: "Vacation" },
  { value: "sick",       label: "Sick leave" },
  { value: "emergency",  label: "Emergency" },
  { value: "maternity",  label: "Maternity" },
  { value: "paternity",  label: "Paternity" },
  { value: "unpaid",     label: "Unpaid" },
  { value: "other",      label: "Other" },
];

interface Props {
  searchParams: Promise<{ date?: string; error?: string }>;
}

export default async function NewLeavePage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Redirect HR away — they don't file leave requests
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "hr_manager" || profile?.role === "admin") {
    redirect("/leaves");
  }

  const params  = await searchParams;
  const prefill = params.date ?? "";   // date passed from calendar tap
  const error   = params.error ?? null;

  return (
    <PageContainer>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/leaves"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            File a leave request
          </h1>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{decodeURIComponent(error)}</p>
          </div>
        )}

        {/* Form */}
        <form action={fileLeaveRequest} className="space-y-4">

          {/* Leave type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">
              Leave type
            </label>
            <select
              name="leave_type"
              required
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Select type...</option>
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Start date
              </label>
              <input
                type="date"
                name="start_date"
                required
                defaultValue={prefill}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                End date
              </label>
              <input
                type="date"
                name="end_date"
                required
                defaultValue={prefill}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">
              Reason <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              name="reason"
              rows={3}
              placeholder="Brief description of your leave..."
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Info note */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs text-blue-700">
              Weekends are automatically excluded from your total days count.
              Your request will be reviewed by HR.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Submit leave request
          </button>
        </form>
      </div>
    </PageContainer>
  );
}