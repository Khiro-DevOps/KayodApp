import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole } from "@/lib/roles";

export default async function JobOfferRedirectPage({
  params,
}: {
  params: Promise<{ offerId?: string; offerid?: string }>;
}) {
  const resolvedParams = await params;
  const offerId = resolvedParams.offerId ?? resolvedParams.offerid;
  if (!offerId) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = effectiveRole(
    profile?.role,
    user.user_metadata?.role as string | undefined
  );

  if (role === "candidate") {
    const admin = getAdminClient();
    let applicationId = offerId;

    const { data: jobOfferRow } = await admin
      .from("job_offers")
      .select("application_id")
      .eq("id", offerId)
      .maybeSingle();

    if (jobOfferRow?.application_id) {
      applicationId = jobOfferRow.application_id;
    } else {
      const { data: signedDocRow } = await admin
        .from("signed_documents")
        .select("application_id")
        .eq("id", offerId)
        .maybeSingle();

      if (signedDocRow?.application_id) {
        applicationId = signedDocRow.application_id;
      }
    }

    redirect(`/applicant/applications/${encodeURIComponent(applicationId)}`);
  }

  redirect(`/hr/offers/${encodeURIComponent(offerId)}`);
}
