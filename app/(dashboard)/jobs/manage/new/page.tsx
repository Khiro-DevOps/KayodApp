import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { effectiveRole, isHRRole } from "@/lib/roles";
import JobForm from "@/components/job-form";
import { createJob } from "../../actions";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";

export default async function NewJobPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole =
    (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = effectiveRole(profile?.role, authRole);
  if (!isHRRole(role)) redirect("/dashboard");

  return (
    <JobForm
      action={createJob}
      title="Post New Job"
      submitLabel="Create Job"
      backHref="/jobs/manage"
      initialDocuments={DEFAULT_REQUIRED_DOCUMENTS}
      showOfferLetterSettings
    />
  );
}
