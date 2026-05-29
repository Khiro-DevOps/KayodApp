"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApplicantDocument, JobRequiredDocument } from "@/lib/types";
import { markDocumentForInPersonSubmission } from "@/lib/pre-employment-actions";

type DocumentRow = {
  requiredDocument: JobRequiredDocument;
  applicantDocument: ApplicantDocument | null;
};

interface ApplicantDocumentsClientProps {
  applicationId: string;
  jobTitle: string;
  deadline: string | null;
  daysLeft: number | null;
  submissionNote: string | null;
  verifiedCount: number;
  totalRequired: number;
  documents: DocumentRow[];
}

function formatStatus(documentRow: DocumentRow) {
  const applicantDocument = documentRow.applicantDocument;

  if (applicantDocument?.hr_verified) return "Verified";
  if (applicantDocument?.notes) return "Resubmission needed";
  if (applicantDocument?.file_url) return "Submitted";
  return "Pending";
}

export default function ApplicantDocumentsClient({
  applicationId,
  jobTitle,
  deadline,
  daysLeft,
  submissionNote,
  verifiedCount,
  totalRequired,
  documents,
}: ApplicantDocumentsClientProps) {
  const router = useRouter();
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const deadlineTone = daysLeft !== null && daysLeft <= 2 ? "text-red-700" : "text-text-secondary";
  const progress = useMemo(() => (totalRequired === 0 ? 100 : Math.round((verifiedCount / totalRequired) * 100)), [totalRequired, verifiedCount]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>, documentId: string) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setUploadingDocId(documentId);
    setUploadProgress((p) => ({ ...p, [documentId]: 0 }));

    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("File must be a PDF, JPG, or PNG");
      event.currentTarget.value = "";
      setUploadingDocId(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10MB or smaller");
      event.currentTarget.value = "";
      setUploadingDocId(null);
      return;
    }

    const fd = new FormData();
    fd.append("application_id", applicationId);
    fd.append("document_id", documentId);
    fd.append("file", file);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/pre-employment/upload");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress((p) => ({ ...p, [documentId]: pct }));
          }
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && json?.success) {
              toast.success("File uploaded");
              resolve();
            } else {
              toast.error(json?.error || "Upload failed");
              reject(new Error(json?.error || `Upload failed: ${xhr.status}`));
            }
          } catch (err) {
            toast.error("Upload failed");
            reject(err);
          }
        };

        xhr.onerror = () => {
          toast.error("Upload failed");
          reject(new Error("Upload error"));
        };

        xhr.send(fd);
      });

      router.refresh();
    } catch (err: any) {
      console.error("Upload error:", err);
    } finally {
      setUploadingDocId(null);
      setTimeout(() => setUploadProgress((p) => ({ ...p, [documentId]: 0 })), 800);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <header className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">Pre-employment</p>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">Submit your pre-employment requirements</h1>
          <p className="mt-1 text-sm text-text-secondary">{jobTitle}</p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={deadlineTone}>
              {daysLeft === null
                ? "No deadline set"
                : daysLeft <= 0
                  ? "Deadline passed"
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
            <span className="text-text-secondary">{verifiedCount} of {totalRequired} verified</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {deadline && (
          <p className={`text-sm ${deadlineTone}`}>Deadline: {new Date(deadline).toLocaleString()}</p>
        )}

        {submissionNote && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-primary">
            {submissionNote}
          </div>
        )}
      </header>

      <div className="mt-6 space-y-3">
        {documents.map(({ requiredDocument, applicantDocument }) => {
          const status = formatStatus({ requiredDocument, applicantDocument });
          const fileUrl = applicantDocument?.file_url ?? null;
          const isResubmission = status === "Resubmission needed";

          return (
            <article key={requiredDocument.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{requiredDocument.name}</p>
                  <p className="text-xs text-text-secondary">{requiredDocument.is_required ? "Required" : "Optional"}</p>
                </div>
                <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-text-secondary">{status}</div>
              </div>

              {applicantDocument?.notes && isResubmission && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {applicantDocument.notes}
                </p>
              )}

              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  Open uploaded file
                </a>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="space-y-2">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={uploadingDocId === requiredDocument.id}
                    onChange={(event) => handleFileChange(event, requiredDocument.id)}
                    className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                  />
                  <p className="text-xs text-text-secondary">PDF, JPG, PNG up to 10MB.</p>
                  {uploadingDocId === requiredDocument.id && (
                    <div className="mt-2">
                      <p className="text-xs text-text-secondary">Uploading…</p>
                      <div className="h-2 w-full rounded-full bg-gray-200 mt-1">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${uploadProgress[requiredDocument.id] ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <form action={async (formData: FormData) => { await markDocumentForInPersonSubmission(formData); }}>
                  <input type="hidden" name="application_id" value={applicationId} />
                  <input type="hidden" name="document_id" value={requiredDocument.id} />
                  <button type="submit" className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-gray-50">
                    I will submit in person
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
