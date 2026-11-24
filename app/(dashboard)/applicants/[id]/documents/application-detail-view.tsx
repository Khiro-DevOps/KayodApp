"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  Globe,
  Info,
  MapPin,
  Phone,
  Rocket,
  Search,
  Video,
  XCircle,
} from "lucide-react";
import type { OfferNegotiationRow } from "@/app/actions/offer-negotiation";
import type { Application } from "@/lib/types";

interface InterviewProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Interview {
  id: string;
  application_id: string;
  status: string | null;
  interview_type: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  video_room_url: string | null;
  location_notes: string | null;
  profiles: InterviewProfile | null;
}

interface ContractTemplate {
  id: string;
  template_name: string;
  docuseal_template_id: number;
}

interface ActiveContractOffer {
  id: string;
  status: string;
  docuseal_submission_url: string | null;
  embed_src?: string | null;
  salary?: number | null;
  start_date?: string | null;
  work_setup?: string | null;
  department?: string | null;
  location?: string | null;
  company_name?: string | null;
  contract_templates: ContractTemplate[] | null;
}

interface ApplicationDetailViewProps {
  application: Application;
  interviews: Interview[];
  userRole: string | undefined;
  isCurrentUser: boolean;
  contractTemplates: ContractTemplate[];
  activeContractOffer: ActiveContractOffer | null;
  offerId: string | null;
  offerRouteId: string | null;
  negotiations?: OfferNegotiationRow[];
}

const APPLICANT_STAGES = [
  {
    key: "new",
    label: "Applied",
    shortSubtext: "Profile received",
    subtext: "We have safely received your application and profile data.",
    icon: FileText,
  },
  {
    key: "screening",
    label: "Screening",
    shortSubtext: "Resume review",
    subtext: "Our hiring team is evaluating your resume and qualifications.",
    icon: Search,
  },
  {
    key: "interview",
    label: "Interview",
    shortSubtext: "Panel evaluation",
    subtext: "Scheduling or conducting live panel evaluations.",
    icon: Calendar,
  },
  {
    key: "offer",
    label: "Offer",
    shortSubtext: "Contract & onboarding",
    subtext: "Review contract terms and sign onboarding documents.",
    icon: FileSignature,
  },
  {
    key: "hired",
    label: "Hired",
    shortSubtext: "Welcome aboard",
    subtext: "Your hire is confirmed! Welcome aboard.",
    icon: CheckCircle2,
  },
  {
    key: "rejected",
    label: "Closed",
    shortSubtext: "Process concluded",
    subtext: "Application process concluded.",
    icon: XCircle,
  },
] as const;

const getApplicantStageKey = (status: string | null | undefined): string => {
  const cleanStatus = String(status ?? "new").toLowerCase().trim();

  switch (cleanStatus) {
    case "submitted":
    case "applied":
      return "new";

    case "under_review":
    case "shortlisted":
      return "screening";

    case "interview_scheduled":
    case "interviewed":
    case "scheduled":
      return "interview";

    case "offer":
    case "offer_sent":
    case "negotiating":
    case "pre-employment":
    case "pre_employment":
    case "negotiation_pending":
      return "offer";

    case "hired":
    case "hire_confirmed":
      return "hired";

    case "rejected":
      return "rejected";

    default:
      return cleanStatus;
  }
};

function formatEmploymentType(raw: string | null | undefined): string {
  const val = String(raw ?? "").trim().toLowerCase();
  if (!val || val === "full_time" || val === "full-time") return "Full-Time";
  if (val === "part_time" || val === "part-time") return "Part-Time";
  if (val === "contract") return "Contract";
  if (val === "internship" || val === "intern") return "Internship";
  return val
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export default function ApplicationDetailView({
  application,
  interviews,
  activeContractOffer,
  offerRouteId,
}: ApplicationDetailViewProps) {
  const jobPosting = (
    application as unknown as {
      job_postings?: {
        title?: string | null;
        location?: string | null;
        employment_type?: string | null;
        work_setup?: string | null;
        salary_min?: number | null;
        salary_max?: number | null;
        currency?: string | null;
      } | null;
    }
  ).job_postings;

  const jobTitle = jobPosting?.title ?? "Job Application";
  const locationLabel = jobPosting?.location?.trim() || "Cebu City";
  const employmentTypeLabel = formatEmploymentType(jobPosting?.employment_type);

  const rawStatus = String(application.status ?? "new").toLowerCase().trim();
  const normalizedOfferStatus = String(activeContractOffer?.status ?? "").toUpperCase();
  const isAlreadySignedOffer =
    normalizedOfferStatus === "SIGNED" || normalizedOfferStatus === "HIRED";
  const isSentJobOffer =
    normalizedOfferStatus === "SENT" ||
    normalizedOfferStatus === "NEGOTIATING" ||
    isAlreadySignedOffer;

  const applicationStageKey = getApplicantStageKey(application.status);
  const currentStageKey =
    applicationStageKey === "hired" ||
    applicationStageKey === "rejected" ||
    normalizedOfferStatus === "HIRED"
      ? applicationStageKey === "rejected"
        ? "rejected"
        : "hired"
      : isSentJobOffer
        ? "offer"
        : applicationStageKey;

  const isHired = currentStageKey === "hired";
  const isRejected = currentStageKey === "rejected";
  const visibleStages = APPLICANT_STAGES.filter((stage) =>
    stage.key === "rejected" ? isRejected : true
  );

  const currentStageIndex = visibleStages.findIndex((stage) => stage.key === currentStageKey);
  const activeIndex = currentStageIndex === -1 ? 0 : currentStageIndex;

  const progressPercent = isHired
    ? 100
    : Math.min(Math.round(((activeIndex + 1) / visibleStages.length) * 100), 100);

  const stepperFillPercent =
    visibleStages.length > 1
      ? Math.min(100, Math.max(0, (activeIndex / (visibleStages.length - 1)) * 100))
      : 100;

  const upcomingInterview = interviews.find(
    (i) => i.status?.toLowerCase() === "scheduled"
  );
  const pastInterviews = interviews.filter(
    (i) => i.status?.toLowerCase() !== "scheduled"
  );

  const statusBadgeText = isRejected
    ? "CLOSED"
    : isHired
      ? "HIRED"
      : currentStageKey === "offer"
        ? "OFFER"
        : rawStatus.replace(/_/g, " ").toUpperCase();

  const statusBadgeClasses = isRejected
    ? "border-rose-400/40 bg-rose-500/20 text-rose-100"
    : isHired
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
      : "border-white/25 bg-white/15 text-white";

  const formatDateTime = (isoString: string | null | undefined, zone?: string | null) => {
    if (!isoString) return "Date pending";
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone ?? undefined,
      }).format(new Date(isoString));
    } catch {
      return new Date(isoString).toLocaleDateString();
    }
  };

  return (
    <div className="w-full">
      {/* Flush-Top Solid #1E1B4B Royal Purple Header Banner matching /applicant/dashboard */}
      <section className="w-full bg-[#1E1B4B] text-white shadow-[0_12px_32px_rgba(30,27,75,0.12)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-4">
            <Link
              href="/applicant/applications"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Applications</span>
            </Link>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2.5 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {jobTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-200 shrink-0" />
                  <span>{locationLabel}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-indigo-200 shrink-0" />
                  <span>{employmentTypeLabel}</span>
                </span>
              </div>
            </div>

            <div className="shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider ${statusBadgeClasses}`}
              >
                {isHired ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                ) : null}
                {statusBadgeText}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
        {/* Application Track Pipeline Card */}
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1E1B4B]">
                Application Track
              </h2>
              <p className="text-xs text-slate-500">
                Real-time status across each hiring milestone
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-[#EDE9F9] px-3 py-1 text-[11px] font-bold tracking-wider text-[#1E1B4B]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              LIVE TRACKING
            </span>
          </div>

          {/* Desktop 5-Stage Horizontal Progress Stepper */}
          <div className="hidden md:block pt-2 pb-1">
            <div className="relative">
              <div className="absolute left-[10%] right-[10%] top-5 h-1 rounded-full bg-slate-200" />
              <div
                className={`absolute left-[10%] top-5 h-1 rounded-full transition-all duration-500 ${
                  isRejected
                    ? "bg-gradient-to-r from-[#1E1B4B] to-rose-500"
                    : "bg-gradient-to-r from-[#1E1B4B] to-emerald-500"
                }`}
                style={{ width: `${stepperFillPercent * 0.8}%` }}
              />

              <div
                className="relative grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${visibleStages.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleStages.map((stage, idx) => {
                  const Icon = stage.icon;
                  const isRejectedNode = stage.key === "rejected";
                  const isCompleted = isRejected
                    ? idx < activeIndex && !isRejectedNode
                    : idx < activeIndex;
                  const isActive = idx === activeIndex;

                  return (
                    <div
                      key={stage.key}
                      className="flex flex-col items-center text-center px-1"
                    >
                      {isRejectedNode && isActive ? (
                        <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white ring-4 ring-rose-100 shadow-sm">
                          <XCircle className="h-5 w-5" />
                        </div>
                      ) : isCompleted ? (
                        <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#1E1B4B] text-white shadow-xs">
                          <Check className="h-5 w-5" />
                        </div>
                      ) : isActive ? (
                        <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-emerald-100 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                      ) : (
                        <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-400">
                          <Icon className="h-4 w-4" />
                        </div>
                      )}

                      <p
                        className={`mt-3 text-xs font-bold ${
                          isActive
                            ? isRejected
                              ? "text-rose-700"
                              : "text-[#1E1B4B]"
                            : isCompleted
                              ? "text-slate-800"
                              : "text-slate-400"
                        }`}
                      >
                        {stage.label}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] leading-snug ${
                          isActive || isCompleted ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {stage.shortSubtext}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile Compact Vertical Step Cards */}
          <div className="md:hidden space-y-2.5">
            {visibleStages.map((stage, idx) => {
              const Icon = stage.icon;
              const isRejectedNode = stage.key === "rejected";
              const isCompleted = isRejected
                ? idx < activeIndex && !isRejectedNode
                : idx < activeIndex;
              const isActive = idx === activeIndex;
              const isUpcoming = idx > activeIndex;

              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    isActive
                      ? isRejected
                        ? "border-rose-200 bg-rose-50/70"
                        : "border-emerald-200 bg-emerald-50/50"
                      : isCompleted
                        ? "border-indigo-100 bg-[#EDE9F9]/40"
                        : "border-slate-200/80 bg-white opacity-70"
                  }`}
                >
                  {isRejectedNode && isActive ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
                      <XCircle className="h-4 w-4" />
                    </div>
                  ) : isCompleted ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1E1B4B] text-white">
                      <Check className="h-4 w-4" />
                    </div>
                  ) : isActive ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-emerald-100">
                      <Icon className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                      <Icon className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        isUpcoming ? "text-slate-500" : "text-slate-900"
                      }`}
                    >
                      {stage.label}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {isActive
                        ? isRejected
                          ? "Your application process has concluded."
                          : stage.subtext
                        : isCompleted
                          ? "Completed"
                          : "Pending"}
                    </p>
                  </div>

                  {isActive && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
                        isRejected ? "bg-rose-600" : "bg-emerald-600"
                      }`}
                    >
                      {isRejected ? "Closed" : "ACTIVE"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active Offer Action Strip */}
          {currentStageKey === "offer" && activeContractOffer && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-indigo-200/80 bg-[#EDE9F9]/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E1B4B] text-white">
                  <ClipboardCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1E1B4B]">
                    Onboarding document package ready
                  </p>
                  <p className="text-xs text-slate-600">
                    {isAlreadySignedOffer
                      ? "Your offer contract has been signed. You can review your copy anytime."
                      : "Review your employment offer terms and complete digital signing."}
                  </p>
                </div>
              </div>
              <Link
                href={`/applicant/offer/${encodeURIComponent(application.id)}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-900"
              >
                {isAlreadySignedOffer ? "View Signed Offer" : "View Offer"}
              </Link>
            </div>
          )}
        </section>

        {/* Balanced 2-Column Lower Grid (Crisp Solid White Cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Interview History (7 cols) */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col">
            <h3 className="text-base sm:text-lg font-bold text-[#1E1B4B] mb-5">
              Interview History
            </h3>

            {upcomingInterview ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-5 bg-slate-50/70 space-y-4">
                  <div className="flex justify-between items-start gap-3">
                    <h4 className="font-semibold text-[#1E1B4B] text-base">
                      {upcomingInterview.interview_type ?? "Online Interview"}
                    </h4>
                    <span className="shrink-0 bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      Scheduled
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 text-xs sm:text-sm font-medium">
                    <Calendar className="h-4 w-4 text-[#1E1B4B] shrink-0" />
                    <span>
                      {formatDateTime(
                        upcomingInterview.scheduled_at,
                        upcomingInterview.timezone
                      )}
                    </span>
                  </div>

                  <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-xl flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-relaxed">
                      {upcomingInterview.location_notes ??
                        "Room opens 15 minutes before the scheduled start time."}
                    </p>
                  </div>

                  {upcomingInterview.video_room_url ? (
                    <a
                      href={upcomingInterview.video_room_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center gap-2 bg-[#1E1B4B] text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-900 transition-colors shadow-xs text-sm"
                    >
                      <Video className="h-4 w-4" />
                      <span>Join Video Call</span>
                    </a>
                  ) : (
                    <div className="w-full text-center text-xs text-slate-500 bg-white border border-slate-200 p-3 rounded-xl">
                      Meeting room access link pending generation
                    </div>
                  )}
                </div>

                <div className="bg-white border-t border-slate-200/80 px-5 py-3 flex justify-between items-center text-slate-500 text-[11px] font-semibold">
                  <div className="flex items-center gap-1.5 uppercase tracking-wider">
                    <Globe className="h-3.5 w-3.5" />
                    <span>{upcomingInterview.timezone ?? "Asia/Manila"}</span>
                  </div>
                  <span className="text-[#1E1B4B]">Confirmed Slot</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center rounded-2xl">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EDE9F9] text-[#1E1B4B] mb-3">
                  <Calendar className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  No active interview scheduled
                </p>
                <p className="mt-1 text-xs text-slate-500 max-w-xs">
                  When the hiring team schedules an interview, meeting details and join links will appear here.
                </p>
              </div>
            )}

            {pastInterviews.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-200/80">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Previous Interviews
                </p>
                <div className="divide-y divide-slate-100">
                  {pastInterviews.map((past) => (
                    <div
                      key={past.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                          {past.interview_type?.toLowerCase().includes("call") ? (
                            <Phone className="h-4 w-4" />
                          ) : (
                            <Video className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {past.interview_type ?? "Screening"}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {past.scheduled_at
                              ? new Date(past.scheduled_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : ""}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full capitalize">
                        {past.status ?? "Completed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Application Progress Card (5 cols — Crisp Solid White Surface) */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EDE9F9] text-[#1E1B4B] flex items-center justify-center shrink-0">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-base sm:text-lg text-[#1E1B4B]">
                    Application Progress
                  </h3>
                </div>
                <span className="rounded-full border border-indigo-200 bg-[#EDE9F9] px-2.5 py-0.5 text-xs font-bold text-[#1E1B4B]">
                  {progressPercent}%
                </span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {isRejected
                  ? "This application process has concluded."
                  : isHired
                    ? "Congratulations! Your hire has been confirmed. Open your Employee Portal to get started."
                    : currentStageKey === "offer"
                      ? "You have reached the final stage! Complete outstanding document submissions to finalize."
                      : `You are ${progressPercent}% of the way through the hiring pipeline.`}
              </p>
            </div>

            <div className="space-y-4">
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    isRejected
                      ? "bg-rose-500"
                      : isHired
                        ? "bg-emerald-500"
                        : "bg-[#1E1B4B]"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {isHired ? (
                <a
                  href={`/api/applicant/activate-employee?applicationId=${encodeURIComponent(application.id)}`}
                  className="block w-full text-center bg-[#1E1B4B] text-white font-semibold py-2.5 px-4 rounded-xl text-sm hover:bg-indigo-900 active:scale-[0.98] transition-all shadow-xs"
                >
                  Go to Employee Portal
                </a>
              ) : !isRejected && (activeContractOffer || offerRouteId) ? (
                <Link
                  href={`/applicant/offer/${encodeURIComponent(offerRouteId ?? application.id)}/sign`}
                  className="block w-full text-center bg-[#1E1B4B] text-white font-semibold py-2.5 px-4 rounded-xl text-sm hover:bg-indigo-900 active:scale-[0.98] transition-all shadow-xs"
                >
                  Complete Setup
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isRejected}
                  className="w-full bg-[#1E1B4B] text-white font-semibold py-2.5 px-4 rounded-xl text-sm hover:bg-indigo-900 active:scale-[0.98] transition-all disabled:opacity-40 disabled:scale-100"
                >
                  {isRejected ? "Pipeline Closed" : "Complete Setup"}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
