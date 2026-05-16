"use client";

import { useState } from "react";
import { DocusealForm, type DocusealFormCompleteData } from "@docuseal/react";
import { toast } from "sonner";
import { processDocuSealCompletion } from "@/app/(dashboard)/job-offers/job-offer-actions";

interface Props {
  latest_docuseal_url: string;
  embedSrc?: string | null;
  submissionUrl?: string;
  openSigningUrl?: string;
  onRetry?: () => Promise<void> | void;
  onClose?: () => void;
}

export default function DocuSealEmbed({ latest_docuseal_url, embedSrc, submissionUrl, openSigningUrl, onRetry }: Props) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const resolvedEmbedSrc = embedSrc?.trim() || null;
  const fallbackUrl = openSigningUrl ?? latest_docuseal_url ?? submissionUrl ?? "";

  const handleComplete = async (data: DocusealFormCompleteData) => {
    const submissionId = data?.submission?.id;
    const completedSubmissionUrl = data?.submission?.url ?? resolvedEmbedSrc;
    const signedPdfUrl = data?.submission?.combined_document_url ?? data?.submission_url;

    if (!submissionId || !completedSubmissionUrl || !signedPdfUrl) {
      toast.error("Signing completed, but finalization data is missing. Please refresh this page.");
      return;
    }

    setIsCompleting(true);

    try {
      const result = await processDocuSealCompletion(String(submissionId), completedSubmissionUrl, signedPdfUrl);

      if (!result.success) {
        toast.error(result.error || "Failed to finalize offer signing.");
        return;
      }

      toast.success("Offer signed successfully.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to finalize DocuSeal completion:", error);
      toast.error("Failed to finalize offer signing.");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleRetry = async () => {
    if (!onRetry) {
      window.location.reload();
      return;
    }

    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      {resolvedEmbedSrc ? (
        <>
          <div className="overflow-hidden rounded-lg border border-blue-200 bg-white" style={{ minHeight: "600px" }}>
            <DocusealForm
              src={resolvedEmbedSrc}
              className="w-full"
              style={{ minHeight: "600px" }}
              onComplete={handleComplete}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-center text-blue-700">
              {isCompleting ? "Finalizing your signature..." : "Complete the signing process to accept the offer."}
            </p>
            {fallbackUrl && (
              <div className="text-center">
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline"
                >
                  Having trouble? Open it in a new tab instead
                </a>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm font-medium text-red-800">Unable to load signing form. Please try refreshing the page.</p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying..." : "Retry loading signing form"}
          </button>
        </div>
      )}
    </div>
  );
}
