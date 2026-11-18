"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { updateJob } from "../../actions";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { JobPosting } from "@/lib/types";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";
import JobForm, { type JobFormValues } from "@/components/job-form";
import { parseCompensationPackage } from "@/lib/compensation-package";

export default function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense>
      <EditJobForm jobId={id} />
    </Suspense>
  );
}

function EditJobForm({ jobId }: { jobId: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocumentDraft[]>(DEFAULT_REQUIRED_DOCUMENTS);
  const [workLocations, setWorkLocations] = useState<any[]>([]);

  useEffect(() => {
    async function fetchJob() {
      const supabase = createClient();
      const [{ data: jobData }, { data: documentData }, { data: branchesData }] = await Promise.all([
        supabase
          .from("job_postings")
          .select("*")
          .eq("id", jobId)
          .single(),
        supabase
          .from("job_required_documents")
          .select("id, name, is_required")
          .eq("job_posting_id", jobId)
          .order("created_at", { ascending: true }),
        supabase
          .from("office_branches")
          .select("*")
          .order("name", { ascending: true }),
      ]);

      setJob(jobData as JobPosting | null);
      setRequiredDocuments((documentData ?? []).length > 0 ? (documentData as RequiredDocumentDraft[]) : DEFAULT_REQUIRED_DOCUMENTS);
      setWorkLocations(branchesData ?? []);
      setLoading(false);
    }
    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-16 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div>
        <p className="text-sm text-text-secondary">Job not found.</p>
      </div>
    );
  }

  const settings = ((job as { offer_letter_settings?: Record<string, unknown> | null }).offer_letter_settings ??
    null) as Record<string, unknown> | null;
  const compensationPackage = parseCompensationPackage(settings?.compensation_package, settings);

  const initialValues: JobFormValues = {
    title: job.title,
    industry: job.industry ?? undefined,
    jobCategory: job.job_category ?? undefined,
    workMode: (job as any).work_mode ?? (job as any).work_setup ?? undefined,
    employmentType: job.employment_type ?? undefined,
    workLocationId: (job as any).work_location_id ?? (job as any).location ?? undefined,
    shiftStart: (job as any).shift_start ?? undefined,
    shiftEnd: (job as any).shift_end ?? undefined,
    workDays: (job as any).work_days ?? undefined,
    salaryRange:
      job.salary_min != null || job.salary_max != null
        ? `${job.salary_min ?? ""}-${job.salary_max ?? ""}`.replace(/^-|-$|--/g, "")
        : "",
    description: job.description ?? undefined,
    requirements: job.requirements ?? undefined,
    skills: job.required_skills ?? [],
    isPublished: job.is_published,
    phDepartment: typeof settings?.phDepartment === "string" ? settings.phDepartment : undefined,
    phSupervisorName:
      typeof settings?.phSupervisorName === "string" ? settings.phSupervisorName : undefined,
    phSupervisorTitle:
      typeof settings?.phSupervisorTitle === "string" ? settings.phSupervisorTitle : undefined,
    phEmploymentStatus:
      typeof settings?.phEmploymentStatus === "string" ? settings.phEmploymentStatus : undefined,
    phProbationPeriodDays:
      settings?.phProbationPeriodDays != null ? String(settings.phProbationPeriodDays) : undefined,
    phStartDate: typeof settings?.phStartDate === "string" ? settings.phStartDate : undefined,
    phMonthlyBasicSalary:
      settings?.phMonthlyBasicSalary != null ? String(settings.phMonthlyBasicSalary) : undefined,
    scheduleType: ((job as any).schedule_type as JobFormValues["scheduleType"]) ?? undefined,
    restDaysType: ((job as any).rest_days_type as JobFormValues["restDaysType"]) ?? undefined,
    compensationPackage,
  };

  return (
    <JobForm
      action={updateJob}
      title="Edit Job"
      submitLabel="Save Changes"
      backHref={`/hr/jobs/${jobId}`}
      error={error}
      jobId={job.id}
      initialValues={initialValues}
      initialDocuments={requiredDocuments}
      workLocations={workLocations}
      showOfferLetterSettings
      showPublicationStatus
    />
  );
}
