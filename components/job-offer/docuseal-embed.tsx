"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  submissionUrl: string;
  openSigningUrl?: string;
  onClose?: () => void;
}

const EMBED_LOAD_TIMEOUT_MS = 8000;

export default function DocuSealEmbed({ submissionUrl, openSigningUrl, onClose }: Props) {
  const timeoutRef = useRef<number | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
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
  }, [submissionUrl]);

  const handleLoad = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoadState("loaded");
  };

  const handleError = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoadState("failed");
  };

  const fallbackUrl = openSigningUrl ?? submissionUrl;

  if (loadState === "failed") {
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

        <div className="rounded-lg border border-blue-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          <p className="font-medium text-slate-900">Your browser blocked the inline signing view.</p>
          <p className="mt-1 text-slate-600">Open the signing page in a new tab to continue securely.</p>
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Open Signing Page
          </a>
        </div>
      </div>
    );
  }

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

      <div className="relative overflow-hidden rounded-lg bg-gray-100">
        <iframe
          src={submissionUrl}
          className="w-full rounded-lg border border-blue-200"
          style={{ minHeight: "600px" }}
          title="DocuSeal Signing Form"
          onLoad={handleLoad}
          onError={handleError}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs text-center text-blue-700">Complete the signing process to accept the offer.</p>
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
