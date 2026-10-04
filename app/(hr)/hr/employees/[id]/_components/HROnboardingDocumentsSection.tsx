"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  getEmployeeOnboardingProgress,
  reviewOnboardingDocument,
  getSignedDocumentUrl,
} from "@/app/actions/onboarding-documents";
import type {
  EmployeeOnboardingProgress,
  OnboardingDocumentItem,
  EmployeeOnboardingDocument,
} from "@/lib/types";

interface HROnboardingDocumentsSectionProps {
  employeeId: string;
}

export default function HROnboardingDocumentsSection({
  employeeId,
}: HROnboardingDocumentsSectionProps) {
  const [progress, setProgress] = useState<EmployeeOnboardingProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Rejection modal state
  const [rejectingDoc, setRejectingDoc] = useState<EmployeeOnboardingDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Document preview modal state
  const [previewDoc, setPreviewDoc] = useState<EmployeeOnboardingDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchProgress = async () => {
    setIsLoading(true);
    try {
      const res = await getEmployeeOnboardingProgress(employeeId);
      if (res.success && res.data) {
        setProgress(res.data);
      } else {
        toast.error(res.error || "Failed to load employee onboarding documents");
      }
    } catch {
      toast.error("Error fetching onboarding documents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [employeeId]);

  const handleApprove = (docId: string) => {
    startTransition(async () => {
      try {
        const res = await reviewOnboardingDocument(docId, "approved");
        if (res.success) {
          toast.success("Document approved successfully");
          fetchProgress();
        } else {
          toast.error(res.error || "Failed to approve document");
        }
      } catch {
        toast.error("Error approving document");
      }
    });
  };

  const handleOpenRejectModal = (doc: EmployeeOnboardingDocument) => {
    setRejectingDoc(doc);
    setRejectionReason("");
  };

  const handleConfirmReject = () => {
    if (!rejectingDoc) return;
    if (!rejectionReason.trim()) {
      toast.error("Please enter a reason for rejection");
      return;
    }

    startTransition(async () => {
      try {
        const res = await reviewOnboardingDocument(
          rejectingDoc.id,
          "rejected",
          rejectionReason
        );
        if (res.success) {
          toast.success("Document rejected with feedback");
          setRejectingDoc(null);
          setRejectionReason("");
          fetchProgress();
        } else {
          toast.error(res.error || "Failed to reject document");
        }
      } catch {
        toast.error("Error rejecting document");
      }
    });
  };

  const handlePreview = async (doc: EmployeeOnboardingDocument) => {
    setPreviewDoc(doc);
    setIsLoadingPreview(true);
    try {
      const res = await getSignedDocumentUrl(doc.file_path);
      if (res.success && res.data) {
        setPreviewUrl(res.data);
      } else {
        toast.error(res.error || "Failed to load document preview");
        setPreviewDoc(null);
      }
    } catch {
      toast.error("Failed to load document preview");
      setPreviewDoc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card-bg p-8 text-center shadow-sm">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <p className="mt-2 text-xs text-text-muted">Loading onboarding documents...</p>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="rounded-2xl border border-border bg-card-bg p-8 text-center text-text-muted text-sm shadow-sm">
        No onboarding document records available for this employee.
      </div>
    );
  }

  const { items, completionPercentage, approvedCount, totalRequirements, counts } = progress;

  return (
    <div className="space-y-6">
      {/* Header & Stats Bar */}
      <div className="rounded-2xl border border-border bg-card-bg p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-text-main">
              Onboarding Document Verification
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Review and verify Philippine employment requirements for this employee.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xl font-extrabold text-brand">
                {completionPercentage}%
              </span>
              <p className="text-[11px] text-text-muted font-medium">
                {approvedCount} / {totalRequirements} Approved
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface-bg rounded-full h-2.5 overflow-hidden border border-border/50">
          <div
            className="bg-brand h-full rounded-full transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>

        {/* Status Count Badges */}
        <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-medium">
            <span>Pending Upload:</span>
            <span className="font-bold">{counts.pending}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-medium">
            <span>Needs Review:</span>
            <span className="font-bold">{counts.submitted}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
            <span>Approved:</span>
            <span className="font-bold">{counts.approved}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 font-medium">
            <span>Rejected:</span>
            <span className="font-bold">{counts.rejected}</span>
          </div>
        </div>
      </div>

      {/* Document Queue */}
      <div className="rounded-2xl border border-border bg-card-bg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-surface-bg/50 flex items-center justify-between">
          <h3 className="font-semibold text-text-main text-sm">
            Document Requirements Queue ({items.length})
          </h3>
        </div>

        <div className="divide-y divide-border">
          {items.map((item: OnboardingDocumentItem) => {
            const { requirement, document, status } = item;

            return (
              <div
                key={requirement.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-bg/30 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-main text-sm">
                      {requirement.document_name}
                    </span>
                    {requirement.is_required && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">
                        Required
                      </span>
                    )}
                  </div>
                  {requirement.description && (
                    <p className="text-xs text-text-muted">
                      {requirement.description}
                    </p>
                  )}
                  {document && (
                    <p className="text-[11px] text-text-muted font-medium pt-1">
                      Submitted: {document.file_name} •{" "}
                      {new Date(document.created_at).toLocaleDateString()}
                    </p>
                  )}
                  {status === "rejected" && document?.rejection_reason && (
                    <div className="mt-1 text-xs text-rose-600 bg-rose-500/5 p-2 rounded-lg border border-rose-500/20">
                      <strong>Rejection Note:</strong> {document.rejection_reason}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {/* Status Badge */}
                  {status === "approved" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      ✓ Approved
                    </span>
                  )}
                  {status === "rejected" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      ✕ Rejected
                    </span>
                  )}
                  {status === "submitted" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                      ● Submitted
                    </span>
                  )}
                  {status === "pending" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      ⏳ Pending Upload
                    </span>
                  )}

                  {/* Actions for uploaded documents */}
                  {document && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreview(document)}
                        className="px-3 py-1.5 rounded-lg border border-border bg-surface-bg text-text-main text-xs font-medium hover:bg-card-bg transition-colors"
                      >
                        Preview
                      </button>

                      {status === "submitted" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(document.id)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRejectModal(document)}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rejection Modal */}
      {rejectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card-bg border border-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-bold text-text-main text-base">
                Reject Document Submission
              </h4>
              <button
                type="button"
                onClick={() => setRejectingDoc(null)}
                className="text-text-muted hover:text-text-main font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Please state why this document is being rejected (e.g. blurred image, expired clearance, wrong document format).
            </p>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Rejection Reason
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason for the employee..."
                rows={3}
                className="w-full rounded-xl border border-border bg-surface-bg p-3 text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingDoc(null)}
                className="px-4 py-2 rounded-xl border border-border text-text-muted text-xs font-semibold hover:bg-surface-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isPending || !rejectionReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Drawer / Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl bg-card-bg border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 bg-surface-bg">
              <div>
                <h4 className="font-semibold text-text-main text-sm truncate">
                  Document Preview: {previewDoc.file_name}
                </h4>
                <p className="text-[11px] text-text-muted">
                  Signed URL preview • Valid for 15 minutes
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewDoc(null);
                  setPreviewUrl(null);
                }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-text-muted hover:bg-black/10 transition-colors font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-neutral-900 overflow-auto p-4 flex items-center justify-center">
              {isLoadingPreview ? (
                <div className="text-white text-xs flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating preview URL...
                </div>
              ) : previewUrl ? (
                previewDoc.mime_type?.includes("pdf") ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full rounded-lg border-0"
                    title="Document Preview"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                  />
                )
              ) : (
                <p className="text-rose-400 text-xs">Failed to load preview</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
