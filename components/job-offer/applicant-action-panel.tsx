"use client";

import type { JobOffer } from "@/lib/types";
import { useState } from "react";
import { acceptOffer, declineOffer } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";
import NegotiationForm from "./negotiation-form";
import DocuSealEmbed from "./docuseal-embed";

interface Props {
  offer: JobOffer;
}

export default function ApplicantActionPanel({ offer }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showDocuSeal, setShowDocuSeal] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState<string | null>(null);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [declineConfirm, setDeclineConfirm] = useState(false);

  const canNegotiate = offer.negotiation_round < 3 &&
    (offer.status === "pending" || offer.status === "negotiating");

  const canAccept = offer.status === "pending" || offer.status === "negotiating";
  const canDecline = offer.status === "pending" || offer.status === "negotiating" || offer.status === "accepted";

  // Handle Accept
  const handleAccept = async () => {
    setIsLoading(true);
    try {
      const result = await acceptOffer(offer.id);
      if (result.success) {
        setSubmissionUrl(result.submissionUrl || null);
        setEmbedSrc(result.embedSrc || null);
        setShowDocuSeal(true);
        toast.success("Signing form opened. Please complete the signature process.");
      } else {
        toast.error(result.error || "Failed to accept offer");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Decline
  const handleDecline = async () => {
    setIsLoading(true);
    try {
      const result = await declineOffer(offer.id);
      if (result.success) {
        toast.success("Offer declined successfully");
        window.location.reload();
      } else {
        toast.error(result.error || "Failed to decline offer");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Render based on status
  if (offer.status === "accepted") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 space-y-4">
        <div className="text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="font-semibold text-green-900">Offer Accepted</p>
          <p className="text-xs text-green-800 mt-2">
            You have successfully signed this offer.
            {offer.accepted_at && (
              <>
                <br />
                Signed on{" "}
                {new Date(offer.accepted_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </>
            )}
          </p>
        </div>
        {offer.signed_pdf_url && (
          <a
            href={offer.signed_pdf_url}
            download
            className="block w-full text-center rounded-lg border border-green-300 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 transition-colors"
          >
            Download Signed Contract
          </a>
        )}
      </div>
    );
  }

  if (offer.status === "declined") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-2xl mb-2">❌</p>
        <p className="font-semibold text-red-900">Offer Declined</p>
        <p className="text-xs text-red-800 mt-2">You declined this offer.</p>
      </div>
    );
  }

  if (offer.status === "expired") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-2xl mb-2">⏰</p>
        <p className="font-semibold text-gray-900">Offer Expired</p>
        <p className="text-xs text-gray-700 mt-2">This offer is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 sticky top-6">
      {/* Status Info */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
        <p className="text-xs text-blue-700">
          {offer.status === "negotiating"
            ? "Round " + offer.negotiation_round + " of 3"
            : "Status: Pending"}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Accept Button */}
        {canAccept && (
          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 transition-colors"
          >
            {isLoading ? "Processing..." : "✓ Accept Offer"}
          </button>
        )}

        {/* Negotiate Button */}
        {canNegotiate && !showNegotiation && (
          <button
            onClick={() => setShowNegotiation(true)}
            disabled={isLoading}
            className="w-full rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            💬 Negotiate
          </button>
        )}

        {/* Decline Button */}
        {canDecline && !declineConfirm && (
          <button
            onClick={() => setDeclineConfirm(true)}
            disabled={isLoading}
            className="w-full rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            ❌ Decline
          </button>
        )}

        {/* Negotiation Round Reached */}
        {offer.negotiation_round >= 3 && !canAccept && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              Maximum negotiation rounds reached. Please accept or decline the current offer.
            </p>
          </div>
        )}
      </div>

      {/* Decline Confirmation */}
      {declineConfirm && (
        <div className="space-y-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-900 font-semibold">
            Are you sure? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDecline}
              disabled={isLoading}
              className="flex-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
            >
              Yes, Decline
            </button>
            <button
              onClick={() => setDeclineConfirm(false)}
              disabled={isLoading}
              className="flex-1 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Negotiation Form */}
      {showNegotiation && (
        <NegotiationForm
          offerId={offer.id}
          terms={offer.terms}
          onClose={() => setShowNegotiation(false)}
          onSuccess={() => {
            setShowNegotiation(false);
            window.location.reload();
          }}
        />
      )}

      {/* DocuSeal Embed */}
      {showDocuSeal && submissionUrl && (
        <DocuSealEmbed
          latest_docuseal_url={submissionUrl}
          embedSrc={embedSrc}
          onRetry={handleAccept}
          onClose={() => setShowDocuSeal(false)}
        />
      )}
    </div>
  );
}
