"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CheckCircle, ExternalLink, PenLine } from "lucide-react";
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
  isAlreadySigned: boolean;
  companyName: string;
  candidateEmail: string;
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

function Timeline({ status, hasSigned }: { status: string; hasSigned: boolean }) {
  const normalizedStatus = status.toLowerCase();
  const timelineStages = [
    {
      key: "offer_sent",
      label: "Offer sent",
      active: true,
    },
    {
      key: "your_response",
      label: "Your response",
      active: ["sent", "negotiating", "pending_signature", "accepted", "signed", "hired", "declined"].includes(normalizedStatus),
    },
    {
      key: "hr_review",
      label: "HR review",
      active: ["pending_signature", "accepted", "signed", "hired"].includes(normalizedStatus) || hasSigned,
    },
    {
      key: "signed_done",
      label: "Signed & done",
      active: ["accepted", "signed", "hired"].includes(normalizedStatus) || hasSigned,
    },
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary">Offer timeline</h2>
      <div style={{ display: "flex", alignItems: "center", padding: "20px 0" }}>
        {timelineStages.map((stage, index) => (
          <Fragment key={stage.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: stage.active ? "#16a34a" : "#e8e8e4",
                  border: stage.active ? "2px solid #16a34a" : "2px solid #d1d5db",
                  transition: "background 0.3s, border-color 0.3s",
                }}
              />
              <span style={{ fontSize: 11, color: stage.active ? "#16a34a" : "#9ca3af", whiteSpace: "nowrap" }}>
                {stage.label}
              </span>
            </div>
            {index < timelineStages.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: timelineStages[index + 1].active ? "#16a34a" : "#e8e8e4",
                  margin: "0 4px",
                  marginBottom: 18,
                  transition: "background 0.3s",
                }}
              />
            )}
          </Fragment>
        ))}
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
  isAlreadySigned,
  companyName,
  candidateEmail,
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
  const normalizedStatus = offer.status.toLowerCase();
  const isSignedStatus = ["signed", "accepted", "hired"].includes(normalizedStatus);
  const [hasSigned, setHasSigned] = useState(isAlreadySigned || isSignedStatus);
  const pollableStatuses = ["sent", "pending_signature", "negotiating"];
  const shouldPollOffer = !hasSigned && pollableStatuses.includes(normalizedStatus);

  useEffect(() => {
    if (isAlreadySigned || isSignedStatus) {
      setHasSigned(true);
    }
  }, [isAlreadySigned, isSignedStatus]);

  useEffect(() => {
    if (!shouldPollOffer) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [router, shouldPollOffer]);

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

  const handleSigningComplete = async (data?: unknown) => {
    setHasSigned(true);

    try {
      const response = await fetch(`/api/job-offers/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "signed", docusealData: data }),
      });

      if (!response.ok) {
        throw new Error(`Signing update failed with status ${response.status}`);
      }

      router.refresh();
    } catch (error) {
      console.error("[OfferPage] Failed to update signing status:", error);
    }
  };

  const status = normalizedStatus;
  const displayStatus = hasSigned ? "signed" : status;
  const canSign = Boolean(resolvedEmbedSrc) && !hasSigned;
  const showSignedBanner = hasSigned;
  const salaryText = formatSalaryRange(salaryMin, salaryMax, currency);

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[720px] px-4 py-6 pb-16 sm:px-6 sm:py-8">
        <div className="space-y-6">
          <section className="py-10 text-center">
            <CompanyBadge name={companyName} />
            <h1 className="mt-6 text-2xl font-medium text-text-primary">Your offer is ready, {candidateFirstName}</h1>
            <p className="mb-5 mt-1 text-base text-text-secondary">{jobTitle}</p>
            <StatusPill status={displayStatus} />
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
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      width: "100%",
                      padding: "16px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#16a34a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <CheckCircle size={20} color="#fff" />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#15803d" }}>Contract signed</p>
                      <p style={{ fontSize: 12, color: "#16a34a", marginTop: 2 }}>
                        Signed on {new Intl.DateTimeFormat("en-PH", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }).format(new Date())}
                      </p>
                    </div>
                  </div>
                  {signedPdfUrl ? (
                    <a
                      href={signedPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Download signed contract
                    </a>
                  ) : null}
                </div>
              ) : canSign ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasSigned) return;
                      if (resolvedEmbedSrc) setSigningOpen(true);
                    }}
                    disabled={!resolvedEmbedSrc || hasSigned}
                    title={!resolvedEmbedSrc ? "Signing link is being prepared" : undefined}
                    className="inline-flex w-full items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    {resolvedEmbedSrc ? "Sign now" : "Preparing..."}
                  </button>
                  <span className="text-xs text-text-secondary sm:ml-auto text-center sm:text-right">
                    Secured by DocuSeal
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-text-secondary">
                  The signing session has not been generated yet.
                </div>
              )}
            </div>
          </section>

          <Timeline status={displayStatus} hasSigned={hasSigned} />

          <Footer hrEmail={hrEmail} />
        </div>

        {/* Signing Modal is rendered directly in the top level flex container instead of in the overflow:hidden layout container */}
        {!hasSigned && signingUrl && resolvedEmbedSrc && (
          <SigningModal
            isOpen={signingOpen}
            onClose={() => {
              setSigningOpen(false);
              router.refresh();
            }}
            onSigningComplete={handleSigningComplete}
            embedSrc={resolvedEmbedSrc}
            jobTitle={jobTitle}
            companyName={companyName}
            candidateEmail={candidateEmail}
          />
        )}
      </div>
    </div>
  );
}
