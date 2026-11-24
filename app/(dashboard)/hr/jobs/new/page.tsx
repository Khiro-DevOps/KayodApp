import { createClient } from "@/lib/supabase/server";
import { requireHrPermission } from "@/lib/rbac/server";
import JobForm from "@/components/job-form";
import { createJob } from "@/app/(dashboard)/hr/jobs/actions";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";
import { fetchDepartmentsAndSupervisors } from "@/lib/job-headcount-server";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const ctx = await requireHrPermission("jobs:manage");
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error =
    typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error : null;

  const [{ data: workLocations }, { departments, supervisorCandidates }] = await Promise.all([
    supabase.from("office_branches").select("*").order("name", { ascending: true }),
    fetchDepartmentsAndSupervisors(ctx.tenant_id),
  ]);

  return (
    <JobForm
      action={createJob}
      title="Post New Job"
      submitLabel="Publish Job Posting"
      backHref="/hr/jobs"
      error={error}
      initialDocuments={DEFAULT_REQUIRED_DOCUMENTS}
      showOfferLetterSettings
      workLocations={workLocations ?? []}
      departments={departments}
      supervisorCandidates={supervisorCandidates}
      tenantId={ctx.tenant_id}
    />
  );
}
