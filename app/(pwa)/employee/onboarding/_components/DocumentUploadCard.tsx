"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadOnboardingDocument, getSignedDocumentUrl } from "@/app/actions/onboarding-documents";
import type { OnboardingDocumentItem } from "@/lib/types";

interface DocumentUploadCardProps {
  item: OnboardingDocumentItem;
  employeeId?: string;
}

export default function DocumentUploadCard({ item, employeeId }: DocumentUploadCardProps) {
  const { requirement, document, status } = item;
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be 5 MB or less");
      e.target.value = "";
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error("Only PDF, JPEG, and PNG files are allowed");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("requirement_id", requirement.id);
        formData.append("requirement_code", requirement.document_code);
        if (employeeId) {
          formData.append("employee_id", employeeId);
        }

        const res = await uploadOnboardingDocument(formData);
        if (res.success) {
          toast.success(res.message || "Document uploaded successfully");
          setSelectedFile(null);
        } else {
          toast.error(res.error || "Failed to upload document");
        }
      } catch (err) {
        toast.error("An error occurred during upload");
      }
    });
  };

  const handleViewDocument = async () => {
    if (!document?.file_path) return;
    setIsLoadingPreview(true);
    try {
      const res = await getSignedDocumentUrl(document.file_path);
      if (res.success && res.data) {
        setPreviewUrl(res.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(res.error || "Unable to view document preview");
      }
    } catch {
      toast.error("Failed to load document preview");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Under Review
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Pending Upload
          </span>
        );
    }
  };

  const canUpload = status === "pending" || status === "rejected";

  return (
    <>
      <div className="rounded-2xl border border-border bg-card-bg p-5 shadow-sm transition-all hover:shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-text-main text-base">
                {requirement.document_name}
              </h3>
              {requirement.is_required ? (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">
                  Required
                </span>
              ) : (
                <span className="text-[10px] uppercase font-medium tracking-wider px-1.5 py-0.5 rounded bg-muted/10 text-text-muted">
                  Optional
                </span>
              )}
            </div>
            {requirement.description && (
              <p className="text-xs text-text-muted mt-1">
                {requirement.description}
              </p>
            )}
          </div>
          {getStatusBadge()}
        </div>

        {/* Rejection Alert Banner */}
        {status === "rejected" && document?.rejection_reason && (
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 text-xs text-rose-700 dark:text-rose-300">
            <div className="flex items-start gap-2">
              <span className="text-rose-500 font-bold text-sm">⚠️</span>
              <div>
                <p className="font-semibold text-rose-800 dark:text-rose-200">
                  Rejection Reason:
                </p>
                <p className="mt-0.5">{document.rejection_reason}</p>
                <p className="mt-1 text-[11px] text-rose-600/80">
                  Please re-upload a clear and valid document addressing the reason above.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Document Details & Actions */}
        <div className="mt-4 space-y-3">
          {document && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-bg p-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-main truncate">
                  📄 {document.file_name}
                </p>
                <p className="text-[11px] text-text-muted">
                  Uploaded: {new Date(document.created_at).toLocaleDateString()}
                  {document.file_size_bytes &&
                    ` • ${(document.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleViewDocument}
                disabled={isLoadingPreview}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
              >
                {isLoadingPreview ? "Loading..." : "View File"}
              </button>
            </div>
          )}

          {/* File Picker / Dropzone for pending or rejected */}
          {canUpload && (
            <div className="space-y-3">
              <div className="relative border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-brand/50 transition-colors bg-surface-bg/50">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isPending}
                />
                <div className="flex flex-col items-center justify-center space-y-1">
                  <span className="text-2xl">📤</span>
                  <p className="text-xs font-medium text-text-main">
                    {selectedFile ? selectedFile.name : "Tap or drop document file here"}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    PDF, PNG, JPEG up to 5MB
                  </p>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between gap-2 bg-brand/5 border border-brand/20 p-2.5 rounded-xl text-xs">
                  <span className="truncate text-text-main font-medium">
                    Ready: {selectedFile.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      disabled={isPending}
                      className="text-text-muted hover:text-rose-500 font-bold px-1"
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={isPending}
                      className="px-3 py-1.5 rounded-lg bg-brand text-white font-medium text-xs hover:bg-brand/90 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isPending ? "Uploading..." : "Submit"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      {isPreviewOpen && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl h-[85vh] rounded-2xl bg-card-bg border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 bg-surface-bg">
              <h4 className="font-semibold text-text-main text-sm truncate">
                Preview: {document?.file_name}
              </h4>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-text-muted hover:bg-black/10 transition-colors font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-neutral-900 overflow-auto p-2">
              {document?.mime_type?.includes("pdf") ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full rounded-lg border-0"
                  title="Document Preview"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
