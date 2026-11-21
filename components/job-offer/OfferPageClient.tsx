"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DocusealForm } from "@docuseal/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CheckCircle,
  ExternalLink,
  FileText,
  PenLine,
  UserCheck,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type { OfferNegotiationRow } from "@/app/actions/offer-negotiation";
import NegotiationPanel from "@/components/job-offer/NegotiationPanel";
import SigningModal from "@/components/job-offer/SigningModal";

interface OfferSummary {
  status: string;
}

interface OfferPageClientProps {
  token: string;
  applicationId: string;
  jobId?: string | null;
  employeeId?: string | null;
  offer: OfferSummary;
  isAlreadySigned: boolean;
  applicationStatus?: string | null;
  companyName: string;
  candidateEmail: string;
  candidateFirstName: string;
  candidateFullName?: string;
  jobTitle: string;
  location: string | null;
  employmentType: string | null;
  workSetup: string | null;
  department: string | null;
  startDate: string | null;
  expiresAt: string | null;
  signedAt?: string | null;
  signingMethod?: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  hrEmail?: string | null;
  signingUrl?: string | null;
  embedSrc?: string | null;
  docusealEmbedError?: string | null;
  signedPdfUrl?: string | null;
  negotiations?: OfferNegotiationRow[];
  isHR?: boolean;
  hrHeaderAction?: ReactNode;
  mode?: "default" | "overview" | "sign";
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
    if (minimum === maximum) {
      return formatter.format(minimum);
    }
    return `${formatter.format(minimum)} – ${formatter.format(maximum)}`;
  }

  return formatter.format(minimum ?? maximum ?? 0);
}

function formatEnumTitleCase(value: string | null | undefined, fallback = "To be confirmed") {
  if (!value || !value.trim()) return fallback;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "wfh") return "WFH";
  return trimmed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getStatusPill(status: string, isHR?: boolean) {
  const normalized = status.toLowerCase();

  if (normalized === "signed") {
    return {
      label: isHR ? "Signed — congratulations" : "Contract signed",
      wrapper: "border-green-200 bg-green-50 text-green-700",
      dot: "bg-green-500",
    };
  }

  if (normalized === "negotiating") {
    return {
      label: isHR ? "Under negotiation" : "Negotiation in progress",
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
    label: isHR ? "Offer sent — awaiting candidate signature" : "Awaiting your signature",
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

function StatusPill({ status, isHR }: { status: string; isHR?: boolean }) {
  const pill = getStatusPill(status, isHR);

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
  applicationId,
  jobId,
  employeeId,
  offer,
  isAlreadySigned,
  applicationStatus,
  companyName,
  candidateEmail,
  candidateFirstName,
  candidateFullName,
  jobTitle,
  location,
  employmentType,
  workSetup,
  department,
  startDate,
  expiresAt,
  signedAt,
  signingMethod,
  salaryMin,
  salaryMax,
  currency,
  hrEmail,
  signingUrl,
  embedSrc,
  docusealEmbedError,
  signedPdfUrl,
  negotiations,
  isHR,
  hrHeaderAction,
  mode = "default",
}: OfferPageClientProps) {
  const router = useRouter();
  const signSectionRef = useRef<HTMLDivElement>(null);
  const [signingOpen, setSigningOpen] = useState(false);
  const [resolvedEmbedSrc, setResolvedEmbedSrc] = useState(embedSrc?.trim() || null);
  const [embedLoadError, setEmbedLoadError] = useState(docusealEmbedError?.trim() || null);
  const [isResolvingEmbedSrc, setIsResolvingEmbedSrc] = useState(false);
  const [isPreparingSigningSession, setIsPreparingSigningSession] = useState(false);
  const [signingSessionError, setSigningSessionError] = useState<string | null>(null);
  const normalizedApplicationStatus = String(applicationStatus ?? "").trim().toLowerCase();
  const normalizedStatus = offer.status.toLowerCase();
  const isSignedStatus = ["signed", "accepted", "hired"].includes(normalizedStatus);
  const [hasSigned, setHasSigned] = useState(isAlreadySigned || isSignedStatus);
  const [signToastMessage, setSignToastMessage] = useState<string | null>(null);
  const pollableStatuses = ["sent", "pending_signature", "negotiating"];
  const shouldPollOffer = !hasSigned && pollableStatuses.includes(normalizedStatus);

  useEffect(() => {
    if (!signToastMessage) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setSignToastMessage(null);
    }, 5000);

    return () => window.clearTimeout(timerId);
  }, [signToastMessage]);

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

  useEffect(() => {
    if (
      !isHR &&
      mode !== "overview" &&
      normalizedStatus === "sent" &&
      !hasSigned &&
      !embedSrc?.trim() &&
      !resolvedEmbedSrc &&
      !isResolvingEmbedSrc &&
      !embedLoadError
    ) {
      void fetchEmbedSrc().catch(() => {
        // Handled inside fetchEmbedSrc
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedStatus, hasSigned, embedSrc]);

  const fetchEmbedSrc = async () => {
    setIsResolvingEmbedSrc(true);
    setSigningSessionError(null);

    try {
      const response = await fetch(`/api/job-offers/${encodeURIComponent(token)}/embed-src`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to resolve embed source (${response.status}): ${body || response.statusText}`);
      }

      const data = (await response.json()) as { embedSrc?: string | null; error?: string };
      if (!data?.embedSrc) {
        throw new Error(data?.error || "Embed source not available");
      }

      setResolvedEmbedSrc(data.embedSrc);
      setEmbedLoadError(null);
      return data.embedSrc;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load signing form. Please try refreshing the page.";
      console.error("[OfferPageClient] Failed to resolve DocuSeal embed source", error);
      setEmbedLoadError(message);
      setSigningSessionError(message);
      throw error;
    } finally {
      setIsResolvingEmbedSrc(false);
    }
  };

  const handleRetryDocusealEmbed = async () => {
    await fetchEmbedSrc();
  };

  const handlePrepareSigningSession = async () => {
    if (resolvedEmbedSrc) {
      setSigningOpen(true);
      return;
    }

    setIsPreparingSigningSession(true);
    setSigningSessionError(null);

    try {
      const embed = await fetchEmbedSrc();
      if (embed) {
        setSigningOpen(true);
      }
    } catch {
      // Errors are handled in fetchEmbedSrc
    } finally {
      setIsPreparingSigningSession(false);
    }
  };

  const handleSigningComplete = async (detail?: unknown) => {
    const payload = (detail ?? {}) as {
      submission_id?: string | number | null;
      submission?: { id?: string | number | null } | null;
      slug?: string | null;
    };
    const submissionId = payload?.submission_id ?? payload?.submission?.id ?? null;
    const slug = payload?.slug ?? null;

    setSigningSessionError(null);
    setHasSigned(true);
    setSignToastMessage("Contract signed successfully! HR has been notified to confirm your hire.");

    try {
      const response = await fetch(`/api/job-offers/${encodeURIComponent(token)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "signed",
          submissionId,
          slug,
          docusealData: detail,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null) as { error?: string } | null;
        const message = errBody?.error || `Signing update failed with status ${response.status}`;
        setHasSigned(false);
        setSignToastMessage(null);
        setSigningSessionError(message);
        console.error("[OfferPage] Signing update failed:", message);
        return;
      }

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update signing status";
      setHasSigned(false);
      setSignToastMessage(null);
      setSigningSessionError(message);
      console.error("[OfferPage] Failed to update signing status:", error);
    }
  };

  const status = normalizedStatus;
  const displayStatus = hasSigned ? "signed" : status;
  const isNegotiatingLocked = normalizedStatus === "negotiating" && !hasSigned;
  const isOfferFinalized =
    hasSigned ||
    isSignedStatus ||
    ["signed", "accepted", "hired", "hire_confirmed", "declined", "expired"].includes(normalizedStatus) ||
    ["pre_employment", "hired"].includes(normalizedApplicationStatus);
  const canSign = Boolean(resolvedEmbedSrc) && !hasSigned && !isNegotiatingLocked;
  const showSignedBanner = hasSigned;
  const salaryText = formatSalaryRange(salaryMin, salaryMax, currency);
  const semiMonthlyMin = salaryMin != null ? salaryMin / 2 : null;
  const semiMonthlyMax = salaryMax != null ? salaryMax / 2 : null;
  const semiMonthlyText = formatSalaryRange(semiMonthlyMin, semiMonthlyMax, currency);
  const formattedEmploymentType = formatEnumTitleCase(employmentType);
  const formattedWorkSetup = formatEnumTitleCase(workSetup);
  const displayCandidateName = candidateFullName?.trim() || candidateFirstName;
  const isHired = normalizedApplicationStatus === "hired" || normalizedStatus === "hired";
  const pipelineHref = jobId
    ? `/hr/applicants?jobId=${encodeURIComponent(jobId)}`
    : "/hr/applicants";
  const employeeRecordHref = employeeId
    ? `/hr/employees/${encodeURIComponent(employeeId)}`
    : "/hr/employees";

  const toastBanner = signToastMessage ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-50 flex max-w-md items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
    >
      <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
      <span>{signToastMessage}</span>
    </div>
  ) : null;

  if (!isHR && mode !== "overview" && normalizedApplicationStatus === "pre_employment") {
    return (
      <div className="w-full">
        {toastBanner}
        <div className="mx-auto w-full max-w-[720px] px-4 py-6 pb-16 sm:px-6 sm:py-8">
          <div className="space-y-6">
            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-sky-50 p-6 shadow-sm sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Signature recorded</p>
                  <h1 className="mt-2 text-2xl font-semibold text-text-primary sm:text-3xl">
                    Thank you! Your signature has been recorded.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-text-secondary sm:text-base">
                    Next, please complete your onboarding documents below.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: "Document submission",
                  body: "Upload the remaining pre-employment requirements at your own pace.",
                },
                {
                  title: "Background verification",
                  body: "HR will review the submitted documents once they arrive.",
                },
                {
                  title: "Onboarding confirmation",
                  body: "Complete the final checklist before your first day.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <h2 className="text-sm font-semibold text-text-primary">{item.title}</h2>
                  <p className="mt-2 text-sm text-text-secondary">{item.body}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="text-base font-semibold text-text-primary">What happens next</h2>
              <div className="mt-4 space-y-3 text-sm text-text-secondary">
                <p>• Your signed offer is recorded and the HR team can now review the onboarding checklist.</p>
                <p>• Any required documents can be uploaded from the pre-employment document page.</p>
                <p>• You can return here anytime to check the status of your onboarding journey.</p>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push(`/applicant/applications/${encodeURIComponent(applicationId)}`)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                >
                  Open onboarding documents
                </button>
                {signedPdfUrl && (
                  <a
                    href={signedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
                  >
                    Review signed contract
                  </a>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (isHR && mode === "default") {
    return (
      <div className="w-full space-y-6">
        {toastBanner}

        {/* Top Breadcrumb & Executive Header Bar */}
        <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <Link
              href="/hr/offers"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Offers
            </Link>
            <StatusPill status={displayStatus} isHR />
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <CompanyBadge name={companyName} />
                {expiresAt && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    Expires {formatDate(expiresAt)} · {daysRemaining(expiresAt)}d left
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {displayCandidateName}
                </h1>
                <p className="mt-0.5 text-sm font-medium text-slate-600">
                  {jobTitle}
                  {candidateEmail ? ` · ${candidateEmail}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {signedPdfUrl && (
                <a
                  href={signedPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Download Signed PDF
                </a>
              )}
              {!signedPdfUrl && signingUrl && (
                <a
                  href={signingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open DocuSeal Envelope
                </a>
              )}
              {hrHeaderAction}
            </div>
          </div>
        </div>

        {/* Responsive 12-Column Executive Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left 8 Columns: Offer Terms, Negotiations, Contract & Signature Status */}
          <div className="space-y-6 lg:col-span-8">
            <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">Offer Terms</h2>
                <span className="text-xs font-medium text-slate-500">
                  Employment Package &amp; Role Details
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TermItem label="Base Salary" value={salaryText} emphasis />
                <TermItem label="Location" value={location ?? "To be confirmed"} />
                <TermItem label="Employment Type" value={formattedEmploymentType} />
                <TermItem label="Work Setup" value={formattedWorkSetup} />
                <TermItem label="Department" value={department ?? "General"} />
                <TermItem
                  label="Start Date"
                  value={startDate ? formatDate(startDate) : "To be confirmed"}
                />
              </div>
            </section>

            <NegotiationPanel
              token={token}
              applicationId={applicationId}
              status={status}
              negotiations={negotiations}
              isHR
              signSectionRef={signSectionRef}
              onAccept={handlePrepareSigningSession}
              isPreparingSigningSession={isPreparingSigningSession}
              acceptError={signingSessionError}
            />

            <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Contract &amp; DocuSeal Signature Status
                    </h3>
                    <p className="text-xs text-slate-500">
                      Envelope tracking and executed contract access
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    showSignedBanner
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : normalizedStatus === "negotiating"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {showSignedBanner
                    ? "Completed"
                    : normalizedStatus === "negotiating"
                      ? "Negotiating"
                      : "Awaiting Signature"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div>
                  <p className="text-slate-500 font-medium">Signing Method</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatEnumTitleCase(signingMethod, "Digital (DocuSeal)")}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Signed Timestamp</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {signedAt ? formatDate(signedAt) : "Pending signature"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Document Copy</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {signedPdfUrl ? "Signed PDF ready" : "Generated on completion"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                {showSignedBanner
                  ? `${displayCandidateName} has signed the offer contract.`
                  : normalizedStatus === "negotiating"
                    ? `${displayCandidateName} has requested changes to this offer.`
                    : `Offer sent to ${displayCandidateName}${candidateEmail ? ` (${candidateEmail})` : ""} — currently reviewing and awaiting signature.`}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                {signedPdfUrl && (
                  <a
                    href={signedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Download Signed Contract
                  </a>
                )}
                {signingUrl && (
                  <a
                    href={signingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View DocuSeal Submission
                  </a>
                )}
              </div>
            </section>

            <Timeline status={displayStatus} hasSigned={hasSigned} />
          </div>

          {/* Right 4 Columns: Compensation Breakdown & Pipeline Quick Links */}
          <div className="space-y-6 lg:col-span-4">
            <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Compensation Breakdown
                  </h2>
                  <p className="text-xs text-slate-500">Payroll summary ({currency})</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-xs font-medium text-slate-500">Monthly Base</p>
                  <p className="mt-1 text-xl font-bold text-emerald-700">{salaryText}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <p className="text-xs font-medium text-slate-500">Semi-Monthly Est.</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{semiMonthlyText}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Pay Cadence</span>
                  <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                    Semi-Monthly (15th &amp; 30th)
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#e6e4f0] bg-white p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Hiring Pipeline Quick Links
                  </h2>
                  <p className="text-xs text-slate-500">Jump to related HR records</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Link
                  href={pipelineHref}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
                >
                  <span>View Applicant in Pipeline</span>
                  <ArrowUpRight className="h-4 w-4 text-slate-500" />
                </Link>

                {isHired && (
                  <Link
                    href={employeeRecordHref}
                    className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100/70"
                  >
                    <span className="inline-flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-emerald-700" />
                      View Employee Record
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-emerald-700" />
                  </Link>
                )}

                <Link
                  href="/hr/offers"
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span>All Job Offers</span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {toastBanner}
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 pb-16 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {mode === "overview" && (
            <div>
              <Link
                href={`/applicant/applications/${encodeURIComponent(applicationId)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Application Track
              </Link>
            </div>
          )}

          {mode === "sign" && (
            <div>
              <Link
                href={`/applicant/offer/${encodeURIComponent(applicationId)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Offer Terms
              </Link>
            </div>
          )}

          {mode === "sign" ? (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <CompanyBadge name={companyName} />
                  <div>
                    <h1 className="text-xl font-semibold text-text-primary">{jobTitle}</h1>
                    <p className="mt-1 text-sm text-text-secondary">
                      {salaryText} · Start date: {startDate ? formatDate(startDate) : "To be confirmed"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  <StatusPill status={displayStatus} isHR={isHR} />
                </div>
              </div>
            </section>
          ) : (
            <section className="py-10 text-center">
              <CompanyBadge name={companyName} />
              <h1 className="mt-6 text-2xl font-medium text-text-primary">
                {isHR ? `Offer for ${candidateFirstName}` : `Your offer is ready, ${candidateFirstName}`}
              </h1>
              <p className="mb-5 mt-1 text-base text-text-secondary">{jobTitle}</p>
              <StatusPill status={displayStatus} isHR={isHR} />
              {expiresAt && (
                <p className="mt-3 text-sm text-text-secondary">
                  Offer expires <strong>{formatDate(expiresAt)}</strong> · {daysRemaining(expiresAt)} days remaining
                </p>
              )}
            </section>
          )}

          {mode !== "sign" && (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-text-primary">Offer terms</h2>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <TermItem label="Base salary" value={salaryText} emphasis />
                <TermItem label="Location" value={location ?? "To be confirmed"} />
                <TermItem label="Employment type" value={formattedEmploymentType} />
                <TermItem label="Work setup" value={formattedWorkSetup} />
                <TermItem label="Department" value={department ?? "General"} />
                <TermItem label="Start date" value={startDate ? formatDate(startDate) : "To be confirmed"} />
              </div>
            </section>
          )}

          {mode === "overview" ? (
            <section className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {hasSigned ? "Contract signed" : "Ready to move forward?"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {hasSigned
                      ? "Your signed offer contract is on file. View the signing details or download your copy."
                      : "Review the full contract and sign digitally, or request changes to the offer terms."}
                  </p>
                </div>
                <Link
                  href={`/applicant/offer/${encodeURIComponent(applicationId)}/sign`}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  {hasSigned ? "View Signed Contract" : "Sign the Contract"}
                </Link>
              </div>
            </section>
          ) : (
            <>
              {isHR ? (
                <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <h3 className="mb-1 text-base font-semibold text-text-primary">Contract Status</h3>
                  <p className="text-sm text-text-secondary">
                    {showSignedBanner
                      ? `${candidateFirstName} has signed the offer contract.`
                      : normalizedStatus === "negotiating"
                        ? `${candidateFirstName} has requested changes to this offer.`
                        : `Offer sent to ${candidateFirstName} (${candidateEmail || "candidate"}) — currently reviewing and awaiting signature.`}
                  </p>
                  {signedPdfUrl ? (
                    <div className="mt-4">
                      <a
                        href={signedPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Download signed contract
                      </a>
                    </div>
                  ) : null}
                </section>
              ) : (
                <section ref={signSectionRef} className="rounded-2xl border border-border bg-surface shadow-sm">
                  <div className="p-5 sm:p-6">
                    <h3 className="mb-1 text-base font-semibold text-text-primary">Sign your contract</h3>
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
                    ) : isNegotiatingLocked ? (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                        Negotiation in progress — signing will unlock once HR sends the updated offer.
                      </div>
                    ) : canSign && resolvedEmbedSrc ? (
                      <div className="space-y-4">
                        <div className="min-h-[680px] max-h-[80vh] w-full overflow-y-auto rounded-xl border border-border bg-slate-50/40 p-2 sm:p-4">
                          <DocusealForm
                            src={resolvedEmbedSrc}
                            email={candidateEmail || undefined}
                            withTitle={false}
                            className="w-full"
                            onComplete={handleSigningComplete}
                          />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
                          <button
                            type="button"
                            onClick={() => {
                              if (hasSigned) return;
                              if (resolvedEmbedSrc) setSigningOpen(true);
                            }}
                            disabled={!resolvedEmbedSrc || hasSigned}
                            title={!resolvedEmbedSrc ? "Signing link is being prepared" : undefined}
                            className="inline-flex w-full items-center justify-center rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                          >
                            <PenLine className="mr-2 h-4 w-4" />
                            Sign in full screen
                          </button>
                          <span className="text-center text-xs text-text-secondary sm:ml-auto sm:text-right">
                            Secured by DocuSeal
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-border bg-background p-4 text-sm text-text-secondary">
                        <p>The signing session has not been generated yet.</p>
                        {isResolvingEmbedSrc || isPreparingSigningSession ? (
                          <p className="text-sm text-text-primary">Preparing signing session...</p>
                        ) : null}
                        {(embedLoadError || signingSessionError) && (
                          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            <p>{signingSessionError || embedLoadError}</p>
                            <button
                              type="button"
                              onClick={handleRetryDocusealEmbed}
                              disabled={isResolvingEmbedSrc || isPreparingSigningSession}
                              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Retry signing session
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {(isHR || !isOfferFinalized) && (
                isHR || normalizedStatus === "negotiating" ? (
                  <NegotiationPanel
                    token={token}
                    applicationId={applicationId}
                    status={status}
                    negotiations={negotiations}
                    isHR={isHR}
                    signSectionRef={signSectionRef}
                    onAccept={handlePrepareSigningSession}
                    isPreparingSigningSession={isPreparingSigningSession}
                    acceptError={signingSessionError}
                  />
                ) : (
                  <details className="group rounded-2xl border border-border bg-surface shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-semibold text-[#1E1B4B] transition-colors hover:bg-slate-50/70">
                      <span>Need to negotiate offer terms? Request changes</span>
                      <span className="rounded-lg border border-indigo-200 bg-[#EDE9F9] px-3 py-1 text-xs font-semibold text-[#1E1B4B]">
                        Request changes
                      </span>
                    </summary>
                    <div className="border-t border-border p-4 sm:p-5">
                      <NegotiationPanel
                        token={token}
                        applicationId={applicationId}
                        status={status}
                        negotiations={negotiations}
                        isHR={isHR}
                        signSectionRef={signSectionRef}
                        onAccept={handlePrepareSigningSession}
                        isPreparingSigningSession={isPreparingSigningSession}
                        acceptError={signingSessionError}
                      />
                    </div>
                  </details>
                )
              )}
            </>
          )}

          {mode !== "overview" && <Timeline status={displayStatus} hasSigned={hasSigned} />}

          <Footer hrEmail={hrEmail} />
        </div>

        {/* Signing Modal is rendered directly in the top level flex container instead of in the overflow:hidden layout container */}
        {mode !== "overview" && !isHR && !hasSigned && signingUrl && resolvedEmbedSrc && (
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
