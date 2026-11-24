import { createClient } from "@/lib/supabase/server";
import { requireHrPermission } from "@/lib/rbac/server";
import JobForm from "@/components/job-form";
import { createJob } from "@/app/(dashboard)/hr/jobs/actions";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";

export default async function NewJobPage() {
  await requireHrPermission("jobs:manage");
  const supabase = await createClient();

  const { data: workLocations } = await supabase
    .from("office_branches")
    .select("*")
    .order("name", { ascending: true });

  return (
    <JobForm
      action={createJob}
      title="Post New Job"
      submitLabel="Publish Job Posting"
      backHref="/hr/jobs"
      initialDocuments={DEFAULT_REQUIRED_DOCUMENTS}
      showOfferLetterSettings
      workLocations={workLocations ?? []}
    />
  );
}
