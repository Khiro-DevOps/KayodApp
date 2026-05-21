import { redirect } from "next/navigation";

export default async function DeprecatedOfferPage({ params }: { params: Promise<{ id: string; appId: string }> }) {
  const { id } = await params;
  // Route deprecated: redirect back to applicants list
  redirect(`/jobs/manage/${id}/applicants`);
}