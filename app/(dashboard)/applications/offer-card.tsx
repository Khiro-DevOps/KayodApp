"use client";

import { formatDistanceToNow } from "date-fns";
import { Clock, ExternalLink, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface ActiveContractOffer {
  id: string;
  status: string;
  signing_method: string;
  signed_at: string | null;
  docuseal_submission_url?: string | null;
  contract_templates?: Array<{
    id: string;
    template_name: string | null;
    docuseal_template_id: string;
  }> | null;
}

interface OfferCardProps {
  offer: ActiveContractOffer;
  applicationId: string;
  offerRouteId?: string | null;
}

export default function OfferCard({ offer, applicationId, offerRouteId }: OfferCardProps) {
  const router = useRouter();
  const templateName = offer.contract_templates?.[0]?.template_name || "Contract offer";
  const signingMethodLabel = offer.signing_method === "in_person" ? "In-person" : "Digital";
  const offerPathId = offerRouteId || offer.id || applicationId;

  if (offer.status === "signed" || offer.status === "hired") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-2">
        <div className="text-3xl">✅</div>
        <p className="text-sm font-bold text-emerald-900">You accepted the job offer!</p>
        <p className="text-xs text-emerald-700">
          Congratulations! The HR team will reach out with your onboarding details soon.
        </p>
        {offer.signed_at && (
          <p className="text-xs text-emerald-700">
            Signed {formatDistanceToNow(new Date(offer.signed_at), { addSuffix: true })}
          </p>
        )}
      </div>
    );
  }

  if (offer.status === "declined") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-2">
        <div className="text-3xl">❌</div>
        <p className="text-sm font-bold text-red-800">You declined this job offer.</p>
        <p className="text-xs text-red-700">
          Thank you for letting us know. We wish you all the best in your career.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-surface p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎉</span>
            <h3 className="text-base font-bold text-text-primary">Contract Offer</h3>
          </div>
          <p className="text-xs text-text-secondary">
            Open the DocuSeal signing portal to review and accept the contract.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-gray-50 px-3 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Signing</p>
          <p className="text-xs font-semibold text-text-primary">{signingMethodLabel}</p>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 border border-border p-4 space-y-3">
        <div>
          <p className="text-xs text-text-secondary">Template</p>
          <p className="text-sm font-bold text-text-primary">{templateName}</p>
        </div>
        <p className="text-xs text-text-secondary capitalize">
          Status: {offer.status.replace(/_/g, " ")}
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => router.push(`/job-offer/${encodeURIComponent(offerPathId)}`)}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
        >
          <FileText className="h-4 w-4" />
          Open Signing Portal
        </button>
        {offer.docuseal_submission_url && (
          <a
            href={offer.docuseal_submission_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-text-primary hover:bg-surface/80 transition-colors inline-flex items-center justify-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open DocuSeal
          </a>
        )}
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
        <p className="text-xs text-blue-700 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Your signing session is managed through the DocuSeal portal. If the embed fails, use the button above.
        </p>
      </div>
    </div>
  );
}