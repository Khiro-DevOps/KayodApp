"use client";

import type { JobOffer } from "@/lib/types";
import { useState } from "react";
import { revokeOffer } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";
import NegotiationResponsePanel from "./negotiation-response-panel";
import { Download, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  offer: JobOffer & { applications: any };
}

export default function HRActionPanel({ offer }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [showNegotiations, setShowNegotiations] = useState(false);

  const handleRevoke = async () => {
    setIsLoading(true);
    try {
      const result = await revokeOffer(offer.id);
      if (result.success) {
        toast.success("Offer revoked successfully");
        window.location.reload();
      } else {
        toast.error(result.error || "Failed to revoke offer");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const canRevoke = offer.status !== "accepted" && offer.status !== "expired";

  return (
    <div className="space-y-6">
      {/* Actions Panel */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 sticky top-6">
        {/* Header */}
        <h3 className="font-semibold text-text-primary">HR Actions</h3>

        {/* Activity Timeline */}
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs font-semibold text-text-secondary uppercase">Timeline</p>
          <div className="space-y-2 text-xs">
            <div className="flex gap-3">
              <span className="shrink-0 text-primary">✓</span>
              <span>
                Offer Sent:{" "}
                {new Date(offer.issued_at).toLocaleDateString()}
              </span>
            </div>
            {offer.viewed_at && (
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-600">👁</span>
                <span>
                  Viewed:{" "}
                  {new Date(offer.viewed_at).toLocaleDateString()}
                </span>
              </div>
            )}
            {offer.status === "negotiating" && (
              <div className="flex gap-3">
                <span className="shrink-0 text-blue-600">💬</span>
                <span>Negotiation Round {offer.negotiation_round}</span>
              </div>
            )}
            {offer.accepted_at && (
              <div className="flex gap-3">
                <span className="shrink-0 text-green-600">✅</span>
                <span>
                  Signed:{" "}
                  {new Date(offer.accepted_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 border-t border-border pt-4">
          {/* Download Signed Contract */}
          {offer.status === "accepted" && offer.signed_pdf_url && (
            <a
              href={offer.signed_pdf_url}
              download
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Signed Contract
            </a>
          )}

          {/* Revoke Offer */}
          {canRevoke && !revokeConfirm && (
            <button
              onClick={() => setRevokeConfirm(true)}
              disabled={isLoading}
              className="w-full rounded-lg border border-red-600 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              🔄 Revoke Offer
            </button>
          )}

          {/* Revoke Confirmation */}
          {revokeConfirm && (
            <div className="space-y-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-900 font-semibold">
                Are you sure? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRevoke}
                  disabled={isLoading}
                  className="flex-1 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
                >
                  Yes, Revoke
                </button>
                <button
                  onClick={() => setRevokeConfirm(false)}
                  disabled={isLoading}
                  className="flex-1 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Negotiation Response Panel */}
      {offer.status === "negotiating" && (
        <div className="space-y-4">
          <button
            onClick={() => setShowNegotiations(!showNegotiations)}
            className="w-full flex items-center justify-between rounded-lg border border-border bg-surface p-4"
          >
            <span className="font-semibold text-text-primary">
              💬 Negotiation Requests
            </span>
            {showNegotiations ? (
              <ChevronUp className="h-5 w-5 text-text-secondary" />
            ) : (
              <ChevronDown className="h-5 w-5 text-text-secondary" />
            )}
          </button>

          {showNegotiations && (
            <NegotiationResponsePanel
              offerId={offer.id}
              onClose={() => setShowNegotiations(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
