import { redirect } from "next/navigation";

export default async function JobOfferRedirectPage({ params }: { params: Promise<{ offerId?: string; offerid?: string }> }) {
  const resolvedParams = await params;
  const offerId = resolvedParams.offerId ?? resolvedParams.offerid;
  if (!offerId) {
    return null;
  }

  redirect(`/hr/offers/${encodeURIComponent(offerId)}`);
}
