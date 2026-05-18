"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Download, ExternalLink, Loader2, X } from "lucide-react";

interface HireConfirmBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onHireConfirmed: (applicationId: string) => void;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  isAlreadyConfirmed: boolean;
  offerMetadata: {
    startDate: string | null;
    workSetup: string | null;
    salaryAmount: number | null;
    salaryCurrency: string;
    signedPdfUrl: string | null;
  };
  signedAt: string | null;
  submittedAt: string | null;
}

type ConfirmStep = "review" | "confirming" | "confirmed" | "error";
type SignedPdfState = "loading" | "ready" | "unavailable";

export default function HireConfirmBottomSheet({
  isOpen,
  onClose,
  onHireConfirmed,
  applicationId,
  candidateName,
  candidateEmail,
  jobTitle,
  isAlreadyConfirmed,
  offerMetadata,
  signedAt,
  submittedAt,
}: HireConfirmBottomSheetProps) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>("review");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [signedPdfState, setSignedPdfState] = useState<SignedPdfState>(offerMetadata.signedPdfUrl ? "ready" : "loading");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    setConfirmStep(isAlreadyConfirmed ? "confirmed" : "review");
    setErrorMessage(null);
    setShowConfirmDialog(false);
    setSignedPdfState(offerMetadata.signedPdfUrl ? "ready" : "loading");

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!offerMetadata.signedPdfUrl) {
      timeoutRef.current = setTimeout(() => {
        setSignedPdfState((current) => (current === "loading" ? "unavailable" : current));
      }, 2500);
    }

    return () => {
      document.body.style.overflow = "";
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isOpen, isAlreadyConfirmed, offerMetadata.signedPdfUrl]);

  useEffect(() => {
    if (offerMetadata.signedPdfUrl) {
      setSignedPdfState("ready");
    }
  }, [offerMetadata.signedPdfUrl]);

  async function handleConfirmHire() {
    setConfirmStep("confirming");
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/hr/confirm-hire/${applicationId}`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to confirm hire");
      }

      setConfirmStep("confirmed");
      onHireConfirmed(applicationId);
      setTimeout(() => router.refresh(), 800);
    } catch (error) {
      setConfirmStep("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to confirm hire");
    }
  }

  const initials = candidateName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const signedPdfSection = (() => {
    if (signedPdfState === "loading") {
      return (
        <div className="flex h-[180px] items-center justify-center px-6 text-center">
          <div className="space-y-2">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-text-secondary" />
            <p className="text-sm font-medium text-text-primary">Loading signed PDF</p>
            <p className="text-xs text-text-secondary">Fetching the final document from DocuSeal.</p>
          </div>
        </div>
      );
    }

    if (!offerMetadata.signedPdfUrl || signedPdfState === "unavailable") {
      return (
        <div className="flex h-[180px] items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm font-medium text-text-primary">Signed PDF not available yet</p>
            <p className="mt-1 text-sm text-text-secondary">DocuSeal may still be processing the document.</p>
          </div>
        </div>
      );
    }

    return (
      <iframe
        src={offerMetadata.signedPdfUrl}
        title="Signed offer letter"
        className="block h-[380px] w-full border-0"
      />
    );
  })();

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[92dvh] flex-col overflow-hidden bg-white"
        style={{ borderRadius: "20px 20px 0 0", animation: "slideUp 0.25s ease-out" }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        <div className="flex-shrink-0 border-b border-[#e8e8e4] px-5 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-gray-900">
                {confirmStep === "confirmed" ? "Hire confirmed ✓" : "Review & confirm hire"}
              </p>
              <p className="mt-0.5 text-[12px] text-gray-500">{jobTitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#888]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {confirmStep === "confirmed" && (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600">
                <CheckCircle size={32} color="#fff" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-gray-900">{candidateName} is now an employee</p>
                <p className="mt-1 text-[13px] text-gray-500">A notification has been sent to {candidateEmail}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full rounded-xl bg-[#111] py-3 text-[14px] font-semibold text-white"
              >
                Back to applicants
              </button>
            </div>
          )}

          {(confirmStep === "review" || confirmStep === "confirming" || confirmStep === "error") && (
            <div className="space-y-4 px-5 py-4">
              <div className="flex items-center gap-3 rounded-[14px] border border-[#e8e8e4] bg-[#fafaf8] p-[14px_16px]">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-[#111]">{candidateName}</p>
                  <p className="mt-0.5 text-xs text-[#888]">{candidateEmail}</p>
                </div>
                {isAlreadyConfirmed && (
                  <span className="ml-auto flex-shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                    Hired ✓
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-[14px] border border-[#e8e8e4]">
                <div className="border-b border-[#e8e8e4] px-4 py-3">
                  <p className="m-0 text-[13px] font-semibold text-[#111]">Offer terms</p>
                </div>
                {[
                  {
                    label: "Salary",
                    value:
                      offerMetadata.salaryAmount !== null
                        ? `${offerMetadata.salaryCurrency} ${offerMetadata.salaryAmount.toLocaleString("en-PH")}`
                        : "Not set",
                  },
                  { label: "Start date", value: offerMetadata.startDate ?? "Not set" },
                  { label: "Work setup", value: offerMetadata.workSetup ?? "Not set" },
                  {
                    label: "Signed",
                    value: signedAt
                      ? new Date(signedAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not set",
                  },
                  {
                    label: "Applied",
                    value: submittedAt
                      ? new Date(submittedAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not set",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 border-b border-[#f0f0ee] px-4 py-2.5 text-[13px] last:border-b-0"
                  >
                    <span className="text-[#888]">{row.label}</span>
                    <span className="font-medium text-[#111]">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[14px] border border-[#e8e8e4]">
                <div className="flex items-center justify-between gap-4 border-b border-[#e8e8e4] px-4 py-3">
                  <p className="m-0 text-[13px] font-semibold text-[#111]">Signed document</p>
                  {offerMetadata.signedPdfUrl && signedPdfState === "ready" && (
                    <div className="flex gap-2">
                      <a
                        href={offerMetadata.signedPdfUrl}
                        download
                        className="flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-xs text-[#555] no-underline"
                      >
                        <Download size={12} />
                        Download
                      </a>
                      <a
                        href={offerMetadata.signedPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 py-1.5 text-xs text-[#555] no-underline"
                      >
                        <ExternalLink size={12} />
                        Open
                      </a>
                    </div>
                  )}
                </div>
                {signedPdfSection}
              </div>

              {confirmStep === "error" && errorMessage && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={14} color="#ef4444" className="mt-0.5 flex-shrink-0" />
                  <p className="m-0 text-[13px] text-red-600">{errorMessage}</p>
                </div>
              )}

              <div className="h-24" />
            </div>
          )}
        </div>

        {(confirmStep === "review" || confirmStep === "confirming" || confirmStep === "error") && !isAlreadyConfirmed && (
          <div className="flex-shrink-0 border-t border-[#e8e8e4] bg-white px-5 pb-5 pt-3">
            {!showConfirmDialog ? (
              <button
                type="button"
                onClick={() => setShowConfirmDialog(true)}
                disabled={confirmStep === "confirming"}
                className="w-full rounded-xl py-3 text-[14px] font-semibold text-white transition-opacity"
                style={{
                  background: "#16a34a",
                  opacity: confirmStep === "confirming" ? 0.6 : 1,
                  cursor: confirmStep === "confirming" ? "not-allowed" : "pointer",
                }}
              >
                Confirm hire →
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-center text-[13px] text-[#555]">
                  Confirm hiring <strong>{candidateName}</strong>? This will notify them and change their status to employee.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={confirmStep === "confirming"}
                    className="flex-1 rounded-[10px] border border-[#e8e8e4] bg-white py-[11px] text-sm font-medium text-[#555]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmHire()}
                    disabled={confirmStep === "confirming"}
                    className="flex-[2] rounded-[10px] bg-emerald-600 py-[11px] text-sm font-semibold text-white disabled:cursor-not-allowed"
                    style={{ opacity: confirmStep === "confirming" ? 0.7 : 1 }}
                  >
                    {confirmStep === "confirming" ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <Loader2 size={14} className="animate-spin" />
                        Confirming...
                      </span>
                    ) : (
                      "Yes, confirm hire"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isAlreadyConfirmed && confirmStep !== "confirmed" && (
          <div className="flex-shrink-0 border-t border-[#e8e8e4] bg-white px-5 pb-5 pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle size={16} color="#16a34a" />
              <p className="m-0 text-[13px] font-medium text-emerald-700">Hire already confirmed for {candidateName}</p>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}