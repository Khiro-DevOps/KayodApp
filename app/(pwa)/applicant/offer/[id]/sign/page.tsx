import PageContainer from "@/components/ui/page-container";
import OfferPageClient from "@/components/job-offer/OfferPageClient";
import { loadApplicantOffer } from "../_lib/load-applicant-offer";

export default async function ApplicantOfferSignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const offer = await loadApplicantOffer(id, { includeSigningData: true });

  return (
    <PageContainer>
      <OfferPageClient
        mode="sign"
        token={offer.offerToken}
        applicationId={offer.applicationId}
        offer={{ status: offer.offerStatus }}
        isAlreadySigned={offer.isAlreadySigned}
        applicationStatus={offer.applicationStatus}
        companyName={offer.companyName}
        candidateFirstName={offer.candidateFirstName}
        candidateEmail={offer.candidateEmail}
        jobTitle={offer.jobTitle}
        location={offer.location}
        employmentType={offer.employmentType}
        workSetup={offer.workSetup}
        department={offer.department}
        startDate={offer.startDate}
        expiresAt={offer.expiresAt}
        salaryMin={offer.salaryMin}
        salaryMax={offer.salaryMax}
        currency={offer.currency}
        hrEmail={offer.hrEmail}
        signingUrl={offer.signingUrl}
        embedSrc={offer.embedSrc}
        docusealEmbedError={offer.docusealEmbedError}
        signedPdfUrl={offer.signedPdfUrl}
        negotiations={offer.negotiations}
        isHR={offer.isHR}
      />
    </PageContainer>
  );
}
