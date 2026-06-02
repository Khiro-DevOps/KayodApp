"use client";

import { useState } from "react";

interface ResumeViewerProps {
  resume: {
    id: string;
    title: string;
    pdf_url?: string | null;
    content_text?: string | null;
  };
  candidateName: string;
  signedResumeUrl: string | null;
}

export default function ResumeViewer({ resume, candidateName, signedResumeUrl }: ResumeViewerProps) {
  const [viewMode, setViewMode] = useState<"pdf" | "text">(signedResumeUrl ? "pdf" : "text");

  return (
    <div className="rounded-2xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{resume.title}</h3>
          <p className="text-xs text-text-secondary mt-1">Resume for {candidateName}</p>
        </div>

        {signedResumeUrl && resume.content_text && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("pdf")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === "pdf"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              }`}
            >
              PDF
            </button>
            <button
              onClick={() => setViewMode("text")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === "text"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              }`}
            >
              Text
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {viewMode === "pdf" && signedResumeUrl ? (
          <div className="rounded-lg overflow-hidden bg-gray-50">
            <iframe
              src={signedResumeUrl}
              className="w-full h-96 rounded-lg border border-border"
              title={resume.title}
            />
          </div>
        ) : resume.content_text ? (
          <div className="prose prose-sm max-w-none text-text-secondary">
            <pre className="whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">
              {resume.content_text}
            </pre>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-text-secondary">No resume content available</p>
          </div>
        )}
      </div>

      {/* Download Link */}
      {signedResumeUrl && (
        <div className="border-t border-border px-6 py-4 flex justify-end">
          <a
            href={signedResumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            Download PDF
          </a>
        </div>
      )}
    </div>
  );
}