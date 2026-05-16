"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { DocusealForm, type DocusealFormCompleteData } from "@docuseal/react";
import { toast } from "sonner";

import { processDocuSealCompletion } from "@/app/(dashboard)/job-offers/job-offer-actions";

interface SigningModalProps {
  open: boolean;
  embedSrc?: string | null;
  fallbackUrl: string;
  onClose: () => void;
}

function getFocusableElements(container: HTMLDivElement | null) {
  if (!container) {
    return [] as HTMLElement[];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export default function SigningModal({ open, embedSrc, fallbackUrl, onClose }: SigningModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const resolvedEmbedSrc = embedSrc?.trim() || null;

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const rafId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(panelRef.current);
      if (!focusableElements.length) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";

      previousActiveElementRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const openInNewTab = () => {
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  };

  const handleComplete = async (data: DocusealFormCompleteData) => {
    const submissionId = data?.submission?.id;
    const completedSubmissionUrl = data?.submission?.url ?? resolvedEmbedSrc;
    const signedPdfUrl = data?.submission?.combined_document_url ?? data?.submission_url;

    if (!submissionId || !completedSubmissionUrl || !signedPdfUrl) {
      toast.error("Signing completed, but finalization data is missing. Please refresh this page.");
      return;
    }

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
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signing-modal-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="signing-modal-title" className="text-base font-semibold text-text-primary">
              Sign your offer letter
            </h2>
            <p className="text-sm text-text-secondary">Complete the DocuSeal ceremony without leaving this page.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close signing modal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {resolvedEmbedSrc ? (
            <>
              <DocusealForm
                src={resolvedEmbedSrc}
                className="h-[520px] w-full rounded-xl border border-border bg-background"
                style={{ minHeight: "520px" }}
                onComplete={handleComplete}
              />
              <p className="mt-3 text-center text-xs text-text-secondary">
                Having trouble?{" "}
                <button
                  type="button"
                  onClick={openInNewTab}
                  className="underline decoration-border underline-offset-2 transition-colors hover:text-text-primary"
                >
                  Open it in a new tab instead
                </button>
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-sm font-medium text-red-800">Unable to load signing form. Please try refreshing the page.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
