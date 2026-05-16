"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DocusealForm, type DocusealFormCompleteData } from "@docuseal/react";
import { toast } from "sonner";
import { processDocuSealCompletion } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { normalizeDocusealEmbedUrl } from "@/lib/docuseal";

interface Props {
  latest_docuseal_url: string;
  submissionUrl?: string;
  openSigningUrl?: string;
  onClose?: () => void;
}

const EMBED_LOAD_TIMEOUT_MS = 8000;

export default function DocuSealEmbed({ latest_docuseal_url, submissionUrl, openSigningUrl, onClose }: Props) {
  const timeoutRef = useRef<number | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading");
  const [isCompleting, setIsCompleting] = useState(false);

  const submissionSource = latest_docuseal_url || submissionUrl || "";
  const embedUrl = normalizeDocusealEmbedUrl(submissionSource);

  useEffect(() => {
    if (!embedUrl) {
      setLoadState("failed");
      return;
    }

    setLoadState("loading");

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setLoadState((currentState) => (currentState === "loaded" ? currentState : "failed"));
    }, EMBED_LOAD_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [embedUrl]);

  const handleLoad = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoadState("loaded");
  };

  const handleComplete = async (data: DocusealFormCompleteData) => {
    const submissionId = data?.submission?.id;
    const completedSubmissionUrl = data?.submission?.url ?? embedUrl;
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

  const fallbackUrl = openSigningUrl ?? submissionSource;

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-blue-900">Sign Your Contract</p>
        {onClose && (
          <button onClick={onClose} className="text-blue-600 hover:text-blue-900">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-blue-200 bg-white" style={{ minHeight: "600px" }}>
        {embedUrl ? (
          <DocusealForm
            src={embedUrl}
            className="w-full"
            style={{ minHeight: "600px" }}
            onLoad={handleLoad}
            onComplete={handleComplete}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-center text-blue-700">
          {isCompleting ? "Finalizing your signature..." : "Complete the signing process to accept the offer."}
        </p>
        {loadState === "failed" && (
          <p className="text-xs text-center text-red-700">Inline signing failed to load. Use the fallback button below.</p>
        )}
        <div className="text-center">
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline"
          >
            Prefer to sign in a new tab? Open signing page ↗
          </a>
        </div>
      </div>
    </div>
  );
}
