import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { effectiveRole, isHRRole } from "@/lib/roles";
import OfferForm from "./offer-form";

export default async function CreateOfferPage({
  params,
}: {
  params: Promise<{ id: string; appId: string }>;
}) {
  const { id, appId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const authRole = user.user_metadata?.role as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  // Verify job exists
  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title, salary_min, salary_max, currency, employment_type, location, is_remote, departments(name)")
    .eq("id", id)
    .single();

  if (!job) notFound();

  // Verify application exists and belongs to this job
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id, status,
      profiles ( id, first_name, last_name, email )
    `)
    .eq("id", appId)
    .eq("job_posting_id", id)
    .single();

  if (!application) notFound();

  // Guard — only allow offer creation for negotiating applicants
  if (application.status !== "negotiating") {
    redirect(`/jobs/manage/${id}/applicants`);
  }

  // Check for existing draft offer
  const { data: existingOffer } = await supabase
    .from("job_offers")
    .select("*")
    .eq("application_id", appId)
    .maybeSingle();

  const candidate = application.profiles as any;
  const dept = (job as any).departments?.name ?? null;

  return (
    <PageContainer>
      <div className="space-y-5 max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${id}/applicants`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
              {existingOffer ? "Edit Job Offer" : "Create Job Offer"}
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        {/* Candidate info */}
        <div className="rounded-2xl bg-surface border border-border p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
            {candidate?.first_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {candidate?.first_name} {candidate?.last_name}
            </p>
            <p className="text-xs text-text-secondary">{candidate?.email}</p>
          </div>
        </div>

        <OfferForm
          jobId={id}
          appId={appId}
          existingOffer={existingOffer}
          defaults={{
            position_title: job.title,
            department: dept,
            employment_type: job.employment_type,
            salary_amount: job.salary_min ?? null,
            salary_currency: job.currency ?? "PHP",
            work_location: job.location ?? null,
            work_setup: job.is_remote ? "remote" : "on_site",
          }}
        />
      </div>
    </PageContainer>
  );
}