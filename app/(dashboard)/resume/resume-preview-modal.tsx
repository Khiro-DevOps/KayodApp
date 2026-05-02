"use client";

import { useEffect, useState } from "react";
import { Resume } from "@/lib/types";
import { getResumeSignedUrl } from "./get-signed-url"; 

interface ResumePreviewModalProps {
  resume: Resume | null;
  onClose: () => void;
}

export default function ResumePreviewModal({
  resume,
  onClose,
}: ResumePreviewModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resume) {
      setSignedUrl(null);
      return;
    }

    const fetchSignedUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = await getResumeSignedUrl(resume.id);
        setSignedUrl(url);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load resume";
        setError(errorMessage);
        console.error("Error fetching signed URL:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [resume]);

  if (!resume) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      {/* Modal Content */}
      <div
        className="relative max-h-[90vh] w-full max-w-4xl rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {resume.title || "Resume Preview"}
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                Created {new Date(resume.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close modal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-5 w-5 text-text-secondary"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-120px)] overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                <p className="mt-4 text-sm text-text-secondary">Loading preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-6 w-6 text-red-600"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-text-primary">
                  Failed to load preview
                </p>
                <p className="mt-1 text-xs text-text-secondary">{error}</p>
                {resume.pdf_url && (
                  <a
                    href={resume.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
                  >
                    Open in new tab
                  </a>
                )}
              </div>
            </div>
          ) : signedUrl ? (
            <div className="bg-white">
              <iframe
                src={signedUrl}
                className="h-[calc(90vh-120px)] w-full"
                title={`Resume preview: ${resume.title}`}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <p className="text-sm text-text-secondary">
                {resume.pdf_url
                  ? "No preview available"
                  : "This resume has not been generated yet"}
              </p>
            </div>
          )}
        </div>

        {/* Footer with Download Link */}
        {signedUrl && (
          <div className="border-t border-border bg-gray-50 px-6 py-3">
            <a
              href={signedUrl}
              download={`${resume.title || "resume"}.pdf`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download PDF
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
