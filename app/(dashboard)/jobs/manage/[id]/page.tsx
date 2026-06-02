import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { deleteJob } from "../../actions";
import type { JobListing, JobPosting } from "@/lib/types";
import Link from "next/link";

export default async function JobDetailManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: currentJob } = await supabase
    .from("job_postings")
    .select("*, departments(name)")
    .eq("id", id)
    .maybeSingle<JobPosting>();

  const job = currentJob ?? (await supabase
    .from("job_listings")
    .select("*, employers(company_name)")
    .eq("id", id)
    .maybeSingle<JobListing>()).data;

  if (!job) notFound();

  // Count applicants
  const { count: currentApplicantCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("job_posting_id", id);

  const { count: legacyApplicantCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("job_listing_id", id);

  const applicantCount = currentApplicantCount ?? legacyApplicantCount ?? 0;

  const isLegacyJob = !currentJob;
  const jobTitle = isLegacyJob ? (job as JobListing).title : (job as JobPosting).title;
  const jobDescription = isLegacyJob ? (job as JobListing).description : (job as JobPosting).description;
  const jobRequirements = isLegacyJob ? (job as JobListing).requirements : (job as JobPosting).requirements;
  const jobLocation = isLegacyJob ? (job as JobListing).location : (job as JobPosting).location;
  const jobEmploymentType = isLegacyJob ? (job as JobListing).employment_type : (job as JobPosting).employment_type;
  const jobIsPublished = isLegacyJob ? String((job as JobListing).status).toLowerCase() === "active" : (job as JobPosting).is_published;
  const jobSalaryMin = isLegacyJob ? null : (job as JobPosting).salary_min;
  const jobSalaryMax = isLegacyJob ? null : (job as JobPosting).salary_max;
  const jobCurrency = isLegacyJob ? "PHP" : (job as JobPosting).currency;
  const jobSlots = isLegacyJob ? 1 : (job as JobPosting).slots;
  const jobDepartmentName = isLegacyJob ? (job as JobListing).employers?.company_name ?? null : (job as JobPosting).departments?.name ?? null;
  
  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/jobs/manage"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
            {jobTitle}
          </h1>
        </div>

        {/* Status + Meta */}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              jobIsPublished
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-text-secondary"
            }`}
          >
            {jobIsPublished ? "Published" : "Draft"}
          </span>
          <span className="text-xs text-text-secondary">
            {applicantCount || 0} applicant{applicantCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Job Details Card */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-text-secondary mb-1">Description</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{job.description}</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{jobDescription}</p>
          </div>

          {jobRequirements && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Requirements</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{jobRequirements}</p>
            </div>
          )}

          {!isLegacyJob && job.required_skills && job.required_skills.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {jobLocation && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Location</p>
                <p className="text-sm text-text-primary">{jobLocation} {isLegacyJob ? "" : (job as JobPosting).is_remote && "(Remote)"}</p>
              </div>
            )}
            {(jobSalaryMin || jobSalaryMax) && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Salary Range</p>
                <p className="text-sm text-text-primary">
                  ₱{jobSalaryMin?.toLocaleString()} — ₱{jobSalaryMax?.toLocaleString()} {jobCurrency}
                </p>
              </div>
            )}
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Employment Type</p>
                <p className="text-text-primary capitalize">{jobEmploymentType.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Slots Available</p>
                <p className="text-text-primary">{jobSlots}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href={`/jobs/manage/${job.id}/applicants`}
            className="flex items-center justify-between rounded-2xl bg-primary/5 p-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            View Applicants ({applicantCount || 0})
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>

          <Link
            href={`/jobs/manage/${job.id}/review`}
            className="flex items-center justify-between rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          >
            Review Board (On Hold)
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </Link>

          <div className="flex gap-3">
            <Link
              href={`/jobs/manage/${job.id}/edit`}
              className="flex-1 rounded-2xl bg-primary py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Edit Job
            </Link>
            <form action={deleteJob} className="flex-1">
              <input type="hidden" name="job_id" value={job.id} />
              <button
                type="submit"
                className="w-full rounded-2xl border border-danger py-3 text-sm font-medium text-danger transition-colors hover:bg-red-50"
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}