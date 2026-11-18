"use client";

import { createPortal } from "react-dom";
import OfferDraftForm, {
  type OfferDraftRecord,
  type OfficeBranchItem,
} from "@/components/job-offer/OfferDraftForm";

export default function OfferReviewModal({
  isOpen,
  onClose,
  jobId,
  applicationId,
  offer,
  branches = [],
  candidateName = "Candidate",
  jobTitle = "Offer Preview & Edit",
  onSent,
}: {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  applicationId: string;
  offer: OfferDraftRecord | null;
  branches?: OfficeBranchItem[];
  candidateName?: string;
  jobTitle?: string;
  onSent?: (offerId: string) => void;
}) {
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="z-10 w-full max-w-2xl">
        <OfferDraftForm
          applicationId={applicationId}
          jobId={jobId}
          candidateName={candidateName}
          jobTitle={jobTitle}
          initialOffer={offer}
          branches={branches}
          onClose={onClose}
          onSent={onSent}
        />
      </div>
    </div>,
    document.body
  );
}
