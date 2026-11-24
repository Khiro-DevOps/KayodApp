import { notFound } from "next/navigation";
import { requireHrPermission } from "@/lib/rbac/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { updateJob } from "../../actions";
import type { JobPosting } from "@/lib/types";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";
import JobForm, { type JobFormValues } from "@/components/job-form";
import { parseCompensationPackage } from "@/lib/compensation-package";
import { resolveLeavePolicyFromSources } from "@/lib/leave-policy";
import {
  fetchDepartmentsAndSupervisors,
  fetchOnlineHiredCountsByJob,
} from "@/lib/job-headcount-server";

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const ctx = await requireHrPermission("jobs:manage");
  const { id: jobId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error = typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error : null;

  const admin = getAdminClient();

  const [
    { data: jobData },
    { data: documentData },
    { data: branchesData },
    { departments, supervisorCandidates },
    onlineHiredMap,
  ] = await Promise.all([
    admin.from("job_postings").select("*").eq("id", jobId).maybeSingle(),
    admin
      .from("job_required_documents")
      .select("id, name, is_required")
      .eq("job_posting_id", jobId)
      .order("created_at", { ascending: true }),
    admin.from("office_branches").select("*").order("name", { ascending: true }),
    fetchDepartmentsAndSupervisors(ctx.tenant_id),
    fetchOnlineHiredCountsByJob([jobId]),
  ]);

  if (!jobData) {
    notFound();
  }

  const job = jobData as JobPosting & {
    work_mode?: string | null;
    work_location_id?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
    work_days?: string[] | null;
    offer_letter_settings?: Record<string, unknown> | null;
  };

  const requiredDocuments =
    (documentData ?? []).length > 0
      ? (documentData as RequiredDocumentDraft[])
      : DEFAULT_REQUIRED_DOCUMENTS;

  const settings = (job.offer_letter_settings ?? null) as Record<string, unknown> | null;
  const compensationPackage = parseCompensationPackage(settings?.compensation_package, settings);
  const resolvedLeavePolicy = resolveLeavePolicyFromSources(
    job as unknown as Record<string, unknown>,
    settings
  );

  const initialValues: JobFormValues = {
    title: job.title,
    industry: job.industry ?? undefined,
    jobCategory: job.job_category ?? undefined,
    workMode: job.work_mode ?? job.work_setup ?? undefined,
    employmentType: job.employment_type ?? undefined,
    workLocationId: job.work_location_id ?? job.location ?? undefined,
    shiftStart: job.shift_start ?? undefined,
    shiftEnd: job.shift_end ?? undefined,
    workDays: job.work_days ?? undefined,
    salaryRange:
      job.salary_min != null || job.salary_max != null
        ? `${job.salary_min ?? ""}-${job.salary_max ?? ""}`.replace(/^-|-$|--/g, "")
        : "",
    description: job.description ?? undefined,
    requirements: job.requirements ?? undefined,
    skills: job.required_skills ?? [],
    isPublished: job.is_published,
    phDepartment:
      typeof settings?.department === "string"
        ? settings.department
        : typeof settings?.phDepartment === "string"
          ? settings.phDepartment
          : undefined,
    phSupervisorName:
      typeof settings?.supervisor_name === "string"
        ? settings.supervisor_name
        : typeof settings?.phSupervisorName === "string"
          ? settings.phSupervisorName
          : undefined,
    phSupervisorTitle:
      typeof settings?.supervisor_title === "string"
        ? settings.supervisor_title
        : typeof settings?.phSupervisorTitle === "string"
          ? settings.phSupervisorTitle
          : undefined,
    phEmploymentStatus:
      typeof settings?.employment_status === "string"
        ? settings.employment_status
        : typeof settings?.phEmploymentStatus === "string"
          ? settings.phEmploymentStatus
          : undefined,
    phProbationPeriodDays:
      (settings?.probation_days ?? settings?.phProbationPeriodDays) != null
        ? String(settings?.probation_days ?? settings?.phProbationPeriodDays)
        : undefined,
    phStartDate:
      typeof settings?.expected_start_date === "string"
        ? settings.expected_start_date
        : typeof settings?.phStartDate === "string"
          ? settings.phStartDate
          : undefined,
    phMonthlyBasicSalary:
      settings?.phMonthlyBasicSalary != null ? String(settings.phMonthlyBasicSalary) : undefined,
    scheduleType: job.schedule_type ?? undefined,
    restDaysType: job.rest_days_type ?? undefined,
    workDaysPerWeek:
      typeof settings?.work_days_per_week === "number"
        ? settings.work_days_per_week
        : Array.isArray(job.work_days) && job.work_days.length > 0
          ? job.work_days.length
          : undefined,
    restDaysPolicy:
      typeof settings?.rest_days_policy === "string"
        ? settings.rest_days_policy
        : job.rest_days_type ?? undefined,
    shiftRotationPattern:
      typeof settings?.shift_rotation_pattern === "string"
        ? settings.shift_rotation_pattern
        : undefined,
    compensationPackage,
    slots: job.slots ?? 1,
    onlineHiredCount: onlineHiredMap[jobId] ?? 0,
    hiredWalkinCount: job.hired_walkin_count ?? 0,
    departmentId: job.department_id ?? undefined,
    defaultSupervisorId: job.default_supervisor_id ?? undefined,
    targetJobLevel: job.target_job_level ?? "staff",
    leavePolicyType: resolvedLeavePolicy.leave_policy_type,
    vacationLeaveDays: resolvedLeavePolicy.vacation_leave_days,
    sickLeaveDays: resolvedLeavePolicy.sick_leave_days,
    serviceIncentiveLeaveDays: resolvedLeavePolicy.service_incentive_leave_days,
    leaveEligibility: resolvedLeavePolicy.leave_eligibility,
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
      workLocations={branchesData ?? []}
      departments={departments}
      supervisorCandidates={supervisorCandidates}
      tenantId={ctx.tenant_id}
      showOfferLetterSettings
      showPublicationStatus
    />
  );
}
