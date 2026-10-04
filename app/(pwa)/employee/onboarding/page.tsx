import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeOnboardingProgress } from "@/app/actions/onboarding-documents";
import DocumentUploadCard from "./_components/DocumentUploadCard";
import PageContainer from "@/components/ui/page-container";

export const revalidate = 0;

export default async function EmployeeOnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const res = await getEmployeeOnboardingProgress();

  if (!res.success || !res.data) {
    return (
      <PageContainer>
        <div className="w-full max-w-xl mx-auto p-6 text-center space-y-4">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8">
            <h2 className="font-semibold text-rose-600 text-lg">
              Onboarding Error
            </h2>
            <p className="text-sm text-text-muted mt-2">
              {res.error || "Unable to load onboarding document requirements. Please contact HR."}
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  const { items, completionPercentage, approvedCount, totalRequirements, counts } = res.data;

  return (
    <PageContainer>
      <div className="w-full max-w-xl min-w-0 mx-auto px-4 py-6 space-y-6">
        {/* Header & Progress Card */}
        <div className="rounded-2xl border border-border bg-card-bg p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-text-main">
                Document Submission
              </h1>
              <p className="text-xs text-text-muted mt-1">
                Complete your pre-employment and onboarding document verification.
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-brand">
                {completionPercentage}%
              </span>
              <p className="text-[11px] text-text-muted font-medium">
                {approvedCount} of {totalRequirements} Approved
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-surface-bg rounded-full h-3 overflow-hidden border border-border/50">
            <div
              className="bg-brand h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Itemized Status Counts */}
          <div className="grid grid-cols-4 gap-2 pt-2 text-center text-xs">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2">
              <p className="font-bold text-amber-600 dark:text-amber-400">
                {counts.pending}
              </p>
              <p className="text-[10px] text-text-muted">Pending</p>
            </div>
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2">
              <p className="font-bold text-blue-600 dark:text-blue-400">
                {counts.submitted}
              </p>
              <p className="text-[10px] text-text-muted">Review</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2">
              <p className="font-bold text-emerald-600 dark:text-emerald-400">
                {counts.approved}
              </p>
              <p className="text-[10px] text-text-muted">Approved</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2">
              <p className="font-bold text-rose-600 dark:text-rose-400">
                {counts.rejected}
              </p>
              <p className="text-[10px] text-text-muted">Rejected</p>
            </div>
          </div>
        </div>

        {/* Requirements List */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider px-1">
            Required Documents ({items.length})
          </h2>

          {items.map((item) => (
            <DocumentUploadCard
              key={item.requirement.id}
              item={item}
            />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
