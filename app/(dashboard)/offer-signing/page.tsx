import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";

export default async function OfferSigningPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application } = await supabase
    .from("applications")
    .select("id, contract_offer_id, status, updated_at")
    .eq("candidate_id", user.id)
    .in("status", ["offer_sent", "negotiating"])
    .limit(1)
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (!application) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center max-w-2xl mx-auto mt-12">
          <h2 className="text-xl font-bold text-blue-900 mb-2">No Active Offer Found</h2>
          <p className="text-sm text-blue-800">
            We could not find an active offer for your account. If you expect to see one, refresh the page or contact HR.
          </p>
        </div>
      </PageContainer>
    );
  }

  redirect(`/job-offer/${application.contract_offer_id ?? application.id}`);
}