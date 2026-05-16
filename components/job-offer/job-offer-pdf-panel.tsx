"use client";

import type { JobOffer } from "@/lib/types";
import { Download, ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import Image from "next/image";

interface Props {
  offer: JobOffer;
}

export default function JobOfferPdfPanel({ offer }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Use signed PDF if available, otherwise show placeholder
  const pdfUrl = offer.signed_pdf_url || "/api/generate-offer-pdf/" + offer.id;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="text-lg font-bold text-text-primary">Offer Document</h2>
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a
              href={pdfUrl}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          )}
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-text-secondary" />
          ) : (
            <ChevronDown className="h-5 w-5 text-text-secondary" />
          )}
        </div>
      </button>

      {/* PDF Viewer */}
      {expanded && (
        <div className="space-y-4 border-t border-border pt-4">
          {pdfUrl ? (
            <div className="relative bg-gray-100 rounded-lg overflow-hidden">
              {/* Skeleton Loader */}
              {isLoading && (
                <div className="absolute inset-0 bg-gray-200 animate-pulse" />
              )}

              {/* PDF Iframe */}
              <iframe
                src={`${pdfUrl}#toolbar=0`}
                className="w-full rounded-lg"
                style={{ height: "600px" }}
                onLoad={() => setIsLoading(false)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg bg-gray-50 p-12 text-center">
              <p className="text-sm text-text-secondary">
                PDF will be available after you sign the offer.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
