"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, PenLine, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import NegotiationPanel from "@/components/job-offer/NegotiationPanel";
import SigningModal from "@/components/job-offer/SigningModal";
import { getOrCreateDocusealEmbedSrc } from "@/lib/docuseal-actions";

interface OfferSummary {
  status: string;
}

interface OfferPageClientProps {
  token: string;
  offer: OfferSummary;
  companyName: string;
  candidateFirstName: string;
  jobTitle: string;
  location: string | null;
  employmentType: string | null;
  workSetup: string | null;
  department: string | null;
  startDate: string | null;
  expiresAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  hrEmail?: string | null;
  signingUrl?: string | null;
  embedSrc?: string | null;
  docusealEmbedError?: string | null;
  signedPdfUrl?: string | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function daysRemaining(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(difference / (1000 * 60 * 60 * 24)));
}

function formatSalaryRange(minimum: number | null, maximum: number | null, currency: string) {
  if (minimum == null && maximum == null) {
    return "To be confirmed";
  }

  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  if (minimum != null && maximum != null) {
    return `${formatter.format(minimum)} – ${formatter.format(maximum)}`;
  }

  return formatter.format(minimum ?? maximum ?? 0);
}

function resolveTimelineStep(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "signed") {
    return 3;
  }

  if (normalized === "pending_signature") {
    return 2;
  }

  return 1;
}

function getStatusPill(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "signed") {
    return {
      label: "Signed — congratulations",
      wrapper: "border-green-200 bg-green-50 text-green-700",
      dot: "bg-green-500",
    };
  }

  if (normalized === "negotiating") {
    return {
      label: "Under negotiation",
      wrapper: "border-blue-200 bg-blue-50 text-blue-700",
      dot: "bg-blue-500",
    };
  }

  if (normalized === "expired") {
    return {
      label: "This offer has expired",
      wrapper: "border-red-200 bg-red-50 text-red-700",
      dot: "bg-red-500",
    };
  }

  return {
    label: "Awaiting your signature",
    wrapper: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  };
}

function getCompanyInitials(companyName: string) {
  return companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "CO";
}

function CompanyBadge({ name }: { name: string }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
        {getCompanyInitials(name)}
      </span>
      <span className="text-sm font-medium text-text-primary">{name}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const pill = getStatusPill(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${pill.wrapper}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${pill.dot}`} />
      {pill.label}
    </div>
  );
}

function TermItem({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className={emphasis ? "text-xl font-medium text-green-600" : "text-base font-medium text-text-primary"}>
        {value}
      </p>
    </div>
  );
}

function Timeline({ status }: { status: string }) {
  const steps = ["Offer sent", "Your response", "HR review", "Signed & done"];
  const currentStep = resolveTimelineStep(status);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">Offer timeline</h2>
      <div className="mt-5 flex flex-row items-start overflow-x-hidden">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const dotClass = isCompleted
            ? "border-green-500 bg-green-500"
            : isCurrent
              ? "border-amber-500 bg-amber-500 ring-4 ring-amber-100"
              : "border-border bg-surface";
          const lineClass = index < 3 ? (index < currentStep ? "bg-green-500" : "bg-border") : "";

          return (
            <div key={step} className="flex flex-col items-center flex-1 min-w-0">
              <div className="flex w-full items-center">
                <div className={`h-px flex-1 ${index === 0 ? "opacity-0" : lineClass}`} />
                <span className={`relative z-10 h-4 w-4 rounded-full border-2 ${dotClass}`} aria-hidden="true" />
                <div className={`h-px flex-1 ${index === steps.length - 1 ? "opacity-0" : lineClass}`} />
              </div>
              <p className="mt-3 text-center text-[10px] leading-tight text-text-secondary px-0.5">{step}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Footer({ hrEmail }: { hrEmail?: string | null }) {
  return (
    <p className="text-center text-xs text-text-secondary">
      Questions? Contact HR{" "}
      {hrEmail ? (
        <>
          at <a className="underline underline-offset-2" href={`mailto:${hrEmail}`}>{hrEmail}</a>
        </>
      ) : (
        <span>for help with your offer.</span>
      )}
    </p>
  );
}

export default function OfferPageClient({
  token,
  offer,
  companyName,
  candidateFirstName,
  jobTitle,
  location,
  employmentType,
  workSetup,
  department,
  startDate,
  expiresAt,
  salaryMin,
  salaryMax,
  currency,
  hrEmail,
  signingUrl,
  embedSrc,
  docusealEmbedError,
  signedPdfUrl,
}: OfferPageClientProps) {
  const router = useRouter();
  const signSectionRef = useRef<HTMLDivElement>(null);
  const [signingOpen, setSigningOpen] = useState(false);
  const [resolvedEmbedSrc, setResolvedEmbedSrc] = useState(embedSrc?.trim() || null);
  const [embedLoadError, setEmbedLoadError] = useState(docusealEmbedError?.trim() || null);
  const [isResolvingEmbedSrc, setIsResolvingEmbedSrc] = useState(false);

  useEffect(() => {
    if (!signingOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [router, signingOpen]);

  useEffect(() => {
    setResolvedEmbedSrc(embedSrc?.trim() || null);
    setEmbedLoadError(docusealEmbedError?.trim() || null);
  }, [docusealEmbedError, embedSrc]);

  const handleRetryDocusealEmbed = async () => {
    setIsResolvingEmbedSrc(true);
    try {
      const nextEmbedSrc = await getOrCreateDocusealEmbedSrc(token);
      setResolvedEmbedSrc(nextEmbedSrc);
      setEmbedLoadError(null);
    } catch (error) {
      console.error("[OfferPageClient] Failed to resolve DocuSeal embed source", error);
      setEmbedLoadError(error instanceof Error ? error.message : "Unable to load signing form. Please try refreshing the page.");
    } finally {
      setIsResolvingEmbedSrc(false);
    }
  };

  const status = offer.status.toLowerCase();
  const canSign = Boolean(signingUrl) && status !== "signed";
  const showSignedBanner = status === "signed";
  const salaryText = formatSalaryRange(salaryMin, salaryMax, currency);

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[720px] px-4 py-6 pb-16 sm:px-6 sm:py-8">
        <div className="space-y-6">
          <section className="py-10 text-center">
            <CompanyBadge name={companyName} />
            <h1 className="mt-6 text-2xl font-medium text-text-primary">Your offer is ready, {candidateFirstName}</h1>
            <p className="mb-5 mt-1 text-base text-text-secondary">{jobTitle}</p>
            <StatusPill status={status} />
            {expiresAt && (
              <p className="mt-3 text-sm text-text-secondary">
                Offer expires <strong>{formatDate(expiresAt)}</strong> · {daysRemaining(expiresAt)} days remaining
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Offer terms</h2>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <TermItem label="Base salary" value={salaryText} emphasis />
              <TermItem label="Location" value={location ?? "To be confirmed"} />
              <TermItem label="Employment type" value={employmentType ?? "To be confirmed"} />
              <TermItem label="Work setup" value={workSetup ?? "To be confirmed"} />
              <TermItem label="Department" value={department ?? "General"} />
              <TermItem label="Start date" value={startDate ? formatDate(startDate) : "To be confirmed"} />
            </div>
          </section>

          <NegotiationPanel token={token} status={status} signSectionRef={signSectionRef} />

          <section ref={signSectionRef} className="rounded-2xl border border-border bg-surface shadow-sm">
            <div className="p-5">
              <h3 className="mb-1 text-base font-medium text-text-primary">Sign your contract</h3>
              <p className="mb-4 text-sm text-text-secondary">Ready to accept? Sign your offer letter digitally - takes under 2 minutes.</p>

              {showSignedBanner ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Contract signed</p>
                      <p className="text-sm text-green-700">Your signed copy is ready.</p>
                    </div>
                  </div>
                  {signedPdfUrl ? (
                    <a
                      href={signedPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Download signed contract
                    </a>
                  ) : null}
                </div>
              ) : canSign ? (
                resolvedEmbedSrc ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => setSigningOpen(true)}
                      className="inline-flex w-full items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark sm:w-auto"
                    >
                      <PenLine className="mr-2 h-4 w-4" />
                      Sign now
                    </button>
                    <span className="text-xs text-text-secondary sm:ml-auto text-center sm:text-right">
                      Secured by DocuSeal
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800">{embedLoadError ?? "Unable to load signing form. Please try refreshing the page."}</p>
                    <button
                      type="button"
                      onClick={handleRetryDocusealEmbed}
                      disabled={isResolvingEmbedSrc}
                      className="mt-3 inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResolvingEmbedSrc ? "Retrying..." : "Retry loading signing form"}
                    </button>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-text-secondary">
                  The signing session has not been generated yet.
                </div>
              )}
            </div>
          </section>

          <Timeline status={status} />

          <Footer hrEmail={hrEmail} />
        </div>

        {signingUrl && resolvedEmbedSrc && (
          <SigningModal
            open={signingOpen}
            embedSrc={resolvedEmbedSrc}
            fallbackUrl={signingUrl}
            onClose={() => {
              setSigningOpen(false);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
