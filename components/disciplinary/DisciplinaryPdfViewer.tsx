"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getDisciplinaryDocumentUrlAction } from "@/app/actions/incident-reports";

export interface DisciplinaryPdfViewerProps {
  caseId: string;
  filePath: string;
  title?: string;
  previewLabel?: string;
  downloadFileName?: string;
  variant?: "navy" | "emerald" | "subtle";
  /** Optional cache-busting key (e.g. document SHA-256) to reload signed URL when PDF is stamped */
  versionKey?: string | null;
  className?: string;
}

export default function DisciplinaryPdfViewer({
  caseId,
  filePath,
  title = "Disciplinary Document (PDF)",
  previewLabel = "Preview PDF",
  downloadFileName,
  variant = "navy",
  versionKey = null,
  className = "",
}: DisciplinaryPdfViewerProps) {
  const [isPending, startTransition] = useTransition();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Reset cached signed URL if the underlying file or SHA-256 version changes
    setSignedUrl(null);
  }, [caseId, filePath, versionKey]);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreviewOpen]);

  const resolveUrl = async (): Promise<string | null> => {
    if (signedUrl) return signedUrl;
    const res = await getDisciplinaryDocumentUrlAction({ caseId, filePath });
    if (!res.success || !res.data?.url) {
      toast.error(res.error ?? "Unable to load PDF document.");
      return null;
    }
    setSignedUrl(res.data.url);
    return res.data.url;
  };

  const handlePreview = () => {
    setIsPreviewOpen(true);
    if (!signedUrl) {
      startTransition(async () => {
        await resolveUrl();
      });
    }
  };

  const handleOpenExternal = () => {
    startTransition(async () => {
      const url = await resolveUrl();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  };

  const handleDownload = () => {
    startTransition(async () => {
      const url = await resolveUrl();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (downloadFileName) {
        a.download = downloadFileName;
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const primaryBtnClass =
    variant === "emerald"
      ? "border-emerald-300 bg-emerald-700 text-white hover:bg-emerald-800"
      : variant === "subtle"
        ? "border-slate-200 bg-white text-slate-700 hover:border-[#5B4FE9] hover:text-[#1E1B4B]"
        : "border-[#1E1B4B] bg-[#1E1B4B] text-white hover:bg-[#2d2b68]";

  const secondaryBtnClass =
    variant === "emerald"
      ? "border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
      : "border-slate-200 bg-white text-slate-700 hover:border-[#1E1B4B]/40 hover:text-[#1E1B4B]";

  return (
    <>
      {/* Responsive Action Controls */}
      <div
        className={`flex w-full items-center gap-2 sm:w-auto sm:inline-flex ${className}`}
      >
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending && !isPreviewOpen}
          className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:flex-initial sm:py-1.5 ${primaryBtnClass}`}
        >
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{previewLabel}</span>
        </button>

        <button
          type="button"
          onClick={handleOpenExternal}
          disabled={isPending}
          className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:flex-initial sm:py-1.5 ${secondaryBtnClass}`}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Open in New Tab</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isPending}
          title="Download PDF"
          aria-label="Download PDF"
          className={`hidden sm:inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${secondaryBtnClass}`}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>Download</span>
        </button>
      </div>

      {/* In-System PDF Preview Modal (Desktop Modal / Mobile Full-Screen Sheet) */}
      {mounted &&
        isPreviewOpen &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsPreviewOpen(false);
            }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-[1px] sm:p-4"
          >
            <div className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[82vh] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-200">
              {/* Sticky Top Bar */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#1E1B4B] hover:bg-slate-100 sm:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Close Preview
                  </button>
                  <FileText className="hidden h-4 w-4 shrink-0 text-[#1E1B4B] sm:block" />
                  <h3 className="hidden truncate text-sm font-bold text-slate-900 sm:block">
                    {title}
                  </h3>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {signedUrl && (
                    <>
                      <a
                        href={signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="sm:hidden">Open Externally</span>
                        <span className="hidden sm:inline">Open in New Tab</span>
                      </a>
                      <a
                        href={signedUrl}
                        download={downloadFileName ?? true}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2d2b68] sm:inline-flex"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    aria-label="Close PDF preview"
                    className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:inline-flex"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Viewer Frame */}
              <div className="relative flex flex-1 flex-col bg-slate-100">
                {!signedUrl ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin text-[#1E1B4B]" />
                    <p className="text-xs font-medium">
                      Loading secure PDF preview...
                    </p>
                  </div>
                ) : (
                  <iframe
                    src={signedUrl}
                    title={title}
                    className="h-full w-full flex-1 border-0 bg-white"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
