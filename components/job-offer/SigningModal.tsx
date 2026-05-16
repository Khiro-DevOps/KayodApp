"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ExternalLink, ShieldOff, X } from "lucide-react";

interface SigningModalProps {
  open: boolean;
  embedUrl: string | null;
  fallbackUrl: string;
  onClose: () => void;
}

const FALLBACK_DELAY_MS = 8000;

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

export default function SigningModal({ open, embedUrl, fallbackUrl, onClose }: SigningModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const resolvedEmbedSrc = embedUrl ?? null;

  useEffect(() => {
    if (!open) {
      setIframeBlocked(false);
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    setIframeBlocked(false);

    if (!embedUrl) {
      setIframeBlocked(true);
      return;
    }

    fallbackTimerRef.current = window.setTimeout(() => {
      setIframeBlocked(true);
    }, FALLBACK_DELAY_MS);

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
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";

      previousActiveElementRef.current?.focus?.();
    };
  }, [open, embedUrl, onClose]);

  if (!open) {
    return null;
  }

  const openInNewTab = () => {
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  };

  const handleIframeLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    try {
      const locationHref = event.currentTarget.contentWindow?.location?.href;
      if (locationHref && (locationHref.startsWith("chrome-error") || locationHref === "about:blank")) {
        setIframeBlocked(true);
      }
    } catch {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    }
  };

  const handleIframeError = () => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setIframeBlocked(true);
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
          {!iframeBlocked && resolvedEmbedSrc ? (
            <>
              <iframe
                src={resolvedEmbedSrc ?? undefined}
                className="h-[520px] w-full rounded-xl border border-border bg-background"
                title="DocuSeal signing ceremony"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
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
            <div className="rounded-xl border border-border bg-background px-5 py-8 text-center">
              <ShieldOff className="mx-auto h-10 w-10 text-text-secondary" />
              <p className="mt-3 text-sm text-text-secondary">
                Your browser blocked the inline signing view. Open it securely in a new tab and your progress will be preserved.
              </p>
              <button
                type="button"
                onClick={openInNewTab}
                className="mt-5 inline-flex items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open signing page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
