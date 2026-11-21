"use client";

import React from "react";
import Link from "next/link";
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

import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

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

// 1. Unified Lifecycle matching the Kanban Columns
const APPLICANT_STAGES = [
    { key: "new", label: "Application Submitted", subtext: "We have safely received your profile data." },
    { key: "screening", label: "Screening", subtext: "Our hiring team is evaluating your resume and qualifications." },
    { key: "interview", label: "Interview Stage", subtext: "Scheduling or conducting live panel evaluations." },
    { key: "offer", label: "Offer & Onboarding", subtext: "Review contract terms and sign onboarding documents." },
    { key: "hired", label: "Hired", subtext: "Your hire is confirmed! Welcome aboard." },
    { key: "rejected", label: "Closed", subtext: "Application process concluded." },
];

// 2. Direct Kanban-to-Applicant Status Core Engine
const getApplicantStageKey = (status: string | null | undefined): string => {
    const cleanStatus = String(status ?? "new").toLowerCase().trim();

    switch (cleanStatus) {
        case "submitted":
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

export default function ApplicationDetailView({
    application,
    interviews,
    activeContractOffer,
    offerRouteId,
}: ApplicationDetailViewProps) {

    const jobPosting = (application as unknown as {
        job_postings?: {
            title?: string | null;
            location?: string | null;
            employment_type?: string | null;
            work_setup?: string | null;
            salary_min?: number | null;
            salary_max?: number | null;
            currency?: string | null;
        } | null;
        profiles?: {
            first_name?: string | null;
            last_name?: string | null;
            email?: string | null;
        } | null;
    }).job_postings;
    const jobTitle = jobPosting?.title ?? "Senior Data Analytics & Business Intelligence Lead";

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
        applicationStageKey === "hired" || applicationStageKey === "rejected" || normalizedOfferStatus === "HIRED"
            ? (applicationStageKey === "rejected" ? "rejected" : "hired")
            : isSentJobOffer
                ? "offer"
                : applicationStageKey;
    const isHired = currentStageKey === "hired";
    const isRejected = currentStageKey === "rejected";
    const visibleStages = APPLICANT_STAGES.filter((stage) => (stage.key === "rejected" ? isRejected : true));

    // Compute active sequence positions
    const currentStageIndex = visibleStages.findIndex((stage) => stage.key === currentStageKey);
    const activeIndex = currentStageIndex === -1 ? 0 : currentStageIndex;

    // Progress Bar percentage calculation
    const progressPercent = isHired
        ? 100
        : Math.min(Math.round(((activeIndex + 1) / visibleStages.length) * 100), 100);

    const upcomingInterview = interviews.find((i) => i.status?.toLowerCase() === "scheduled");
    const pastInterviews = interviews.filter((i) => i.status?.toLowerCase() !== "scheduled");

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
        <div className="w-full max-w-7xl mx-auto space-y-6 bg-[#FDF8F2]/70 pb-8 text-on-surface font-body-md selection:bg-indigo-200 selection:text-indigo-900">

            {/* Deep Royal Purple Top Hero Band matching /applicant/dashboard */}
            <div className="-mx-6 -mt-8 rounded-b-[36px] bg-[#1E1B4B] px-6 pt-6 pb-8 text-white shadow-[0_12px_30px_rgba(30,27,75,0.16)] md:mx-0 md:mt-0 md:rounded-3xl md:p-7">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    My Applications
                </h1>
                <p className="mt-1 text-sm text-white/75">
                    Track your role progress and interview stages
                </p>
            </div>

            {/* Target Application Metadata Card */}
            <SolidSurfaceCard className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[#1E1B4B] mb-1 tracking-tight">
                        {jobTitle}
                    </h2>
                    <div className="flex items-center gap-2 text-body-sm text-on-surface-variant font-medium">
                        <span>{jobPosting?.location ?? "Cebu City"}</span>
                        <span>•</span>
                        <span className="lowercase">{jobPosting?.employment_type?.replace("_", " ") ?? "full time"}</span>
                    </div>
                </div>
                <div>
                    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-xs border ${isRejected
                        ? "bg-error-container/20 text-error border-error/30"
                        : "bg-indigo-50 text-[#1E1B4B] border-indigo-200"
                        }`}>
                        {isRejected ? "CLOSED" : rawStatus.replace("_", " ")}
                    </span>
                </div>
            </SolidSurfaceCard>

            {/* Main Structural Columns Grid Setup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Column View: Complete Synced 5-Stage Tracking Pipeline */}
                <SolidSurfaceCard className="lg:col-span-7 p-6">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="font-title-lg text-title-lg text-indigo-950">Application Track</h3>
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-label-caps font-bold tracking-wider text-xs">
                            LIVE TRACKING
                        </span>
                    </div>

                    <div className="space-y-0 relative">
                        {/* Background Inter-node Intersect Spine Connecting Rod */}
                        <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-outline-variant" />

                        {visibleStages.map((stage, idx) => {
                            // Node Evaluation Rules
                            const isRejectedNode = stage.key === "rejected";
                            const isCompleted = isRejected
                                ? idx < currentStageIndex && !isRejectedNode
                                : idx < currentStageIndex;
                            const isActive = idx === currentStageIndex;
                            const isUpcoming = idx > currentStageIndex;

                            return (
                                <div key={stage.key} className={`relative flex gap-6 pb-8 group ${isUpcoming ? "opacity-50" : ""}`}>

                                    {/* Circle Dynamic Node Engine */}
                                    {isRejectedNode && isActive ? (
                                        <div className="relative z-10 w-10 h-10 rounded-full bg-error text-white flex items-center justify-center ring-4 ring-surface-container-lowest shadow-sm">
                                            <span className="material-symbols-outlined text-xl">cancel</span>
                                        </div>
                                    ) : isCompleted ? (
                                        <div className="relative z-10 w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white ring-4 ring-surface-container-lowest transition-all">
                                            <span className="material-symbols-outlined text-xl">check</span>
                                        </div>
                                    ) : isActive ? (
                                        <div className="relative z-10 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-900 ring-4 ring-surface-container-lowest animate-pulse">
                                            <div className="w-3 h-3 bg-indigo-700 rounded-full" />
                                        </div>
                                    ) : (
                                        <div className="relative z-10 w-10 h-10 rounded-full bg-surface-container-highest border-2 border-outline-variant flex items-center justify-center text-outline ring-4 ring-surface-container-lowest">
                                            <span className="material-symbols-outlined text-sm">circle</span>
                                        </div>
                                    )
                                    }

                                    {/* Context Descriptions Block */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className={`font-semibold transition-colors group-hover:text-indigo-700 ${isActive ? (isRejected ? "text-error font-bold" : "text-indigo-900 font-bold") : "text-indigo-950"
                                                }`}>
                                                {stage.label}
                                            </h4>
                                            {isActive && (
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide text-white ${isRejected ? "bg-error" : "bg-indigo-600"
                                                    }`}>
                                                    {isRejected ? "TERMINATED" : "ACTIVE"}
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-on-surface-variant mt-0.5">
                                            {isActive
                                                ? (isRejected ? "Your application progress loop was completed and closed." : stage.subtext)
                                                : isCompleted
                                                    ? "Completed"
                                                    : "Pending"}
                                        </p>

                                        {/* Offer Section Link */}
                                        {stage.key === "offer" && isActive && activeContractOffer && (
                                            <div className="mt-4 bg-surface-container-high rounded-xl p-4 border border-indigo-100 shadow-sm max-w-md animate-fadeIn">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <span className="material-symbols-outlined text-indigo-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                        assignment_turned_in
                                                    </span>
                                                    <p className="text-body-sm font-semibold text-indigo-950">
                                                        Onboarding document package ready
                                                    </p>
                                                </div>
                                                <Link
                                                    href={`/applicant/offer/${encodeURIComponent(application.id)}`}
                                                    className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-body-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm active:scale-95"
                                                >
                                                    {isAlreadySignedOffer ? "View Signed Offer" : "View Offer"}
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </SolidSurfaceCard>

                {/* Right Column View: Interactive Meeting Scheduler Frame History */}
                <div className="lg:col-span-5 space-y-8">
                    <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
                        <h3 className="font-title-lg text-title-lg text-indigo-950 mb-6">Interview History</h3>

                        {upcomingInterview ? (
                            <div className="border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
                                <div className="p-5 bg-surface-container-low">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-semibold text-indigo-950 text-lg">
                                            {upcomingInterview.interview_type ?? "Online Interview"}
                                        </h4>
                                        <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                            Scheduled
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-on-surface-variant text-body-sm mb-4 font-medium">
                                        <span className="material-symbols-outlined text-body-md">calendar_today</span>
                                        <span>{formatDateTime(upcomingInterview.scheduled_at, upcomingInterview.timezone)}</span>
                                    </div>

                                    <div className="bg-error-container/30 border border-error/20 p-3 rounded-xl flex gap-3 mb-5">
                                        <span className="material-symbols-outlined text-error text-xl">info</span>
                                        <p className="text-body-sm text-on-error-container leading-tight">
                                            {upcomingInterview.location_notes ?? "Room opens 15 minutes before the scheduled start time."}
                                        </p>
                                    </div>

                                    {upcomingInterview.video_room_url ? (
                                        <a
                                            href={upcomingInterview.video_room_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md text-center text-body-sm"
                                        >
                                            <span className="material-symbols-outlined">videocam</span>
                                            Join Video Call
                                        </a>
                                    ) : (
                                        <div className="w-full text-center text-body-sm text-on-surface-variant bg-surface-container p-3 rounded-xl">
                                            Meeting room access link pending generation
                                        </div>
                                    )}
                                </div>

                                <div className="bg-surface-container px-5 py-3 flex justify-between items-center text-on-surface-variant text-[11px] font-bold">
                                    <div className="flex items-center gap-1 uppercase tracking-wider">
                                        <span className="material-symbols-outlined text-sm">public</span>
                                        {upcomingInterview.timezone ?? "Asia/Manila"}
                                    </div>
                                    <button className="text-indigo-600 hover:underline transition-all">Add to Calendar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="border border-dashed border-outline-variant p-6 text-center rounded-2xl text-on-surface-variant text-body-sm bg-surface-container-low/40">
                                No active interview meetings scheduled at this moment.
                            </div>
                        )}

                        {pastInterviews.length > 0 && (
                            <div className="mt-8">
                                <p className="text-label-caps text-on-tertiary-container mb-4 font-bold tracking-wider text-xs">PREVIOUS INTERVIEWS</p>
                                <div className="space-y-1">
                                    {pastInterviews.map((past) => (
                                        <div key={past.id} className="flex items-center justify-between py-3 border-b border-outline-variant/30 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant">
                                                    <span className="material-symbols-outlined text-sm">
                                                        {past.interview_type?.toLowerCase().includes("call") ? "phone_in_talk" : "videocam"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-indigo-950 text-sm">{past.interview_type ?? "Screening"}</p>
                                                    <p className="text-[11px] text-on-surface-variant font-medium">
                                                        {past.scheduled_at ? new Date(past.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full capitalize">
                                                {past.status ?? "Completed"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dynamic Progress Metric Meter Widget Block */}
                    <div className="bg-indigo-900 p-6 rounded-2xl text-white shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <span className="material-symbols-outlined">rocket_launch</span>
                            </div>
                            <h4 className="font-bold text-title-lg">Application Progress</h4>
                        </div>
                        <p className="text-body-sm text-indigo-200 mb-6 leading-relaxed">
                            {isRejected
                                ? "This application process has concluded."
                                : isHired
                                    ? "Congratulations! Your hire has been confirmed. Open your Employee Portal to get started."
                                    : currentStageKey === "offer"
                                        ? "You have reached the final stage! Complete outstanding document submissions to finalize."
                                        : `You are ${progressPercent}% of the way through the process pipeline.`}
                        </p>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-6">
                            <div
                                className={`h-full rounded-full shadow-md transition-all duration-500 ease-out ${isRejected ? "bg-error" : isHired ? "bg-emerald-400" : "bg-indigo-400"
                                    }`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        {isHired ? (
                            <a
                                href={`/api/applicant/activate-employee?applicationId=${encodeURIComponent(application.id)}`}
                                className="block w-full text-center bg-white text-indigo-900 font-bold py-2.5 rounded-xl text-body-sm hover:bg-indigo-50 active:scale-[0.98] transition-all"
                            >
                                Go to Employee Portal
                            </a>
                        ) : !isRejected && (activeContractOffer || offerRouteId) ? (
                            <Link
                                href={`/applicant/offer/${encodeURIComponent(offerRouteId ?? application.id)}/sign`}
                                className="block w-full text-center bg-white text-indigo-900 font-bold py-2.5 rounded-xl text-body-sm hover:bg-indigo-50 active:scale-[0.98] transition-all"
                            >
                                Complete Setup
                            </Link>
                        ) : (
                            <button
                                disabled={isRejected}
                                className="w-full bg-white text-indigo-900 font-bold py-2.5 rounded-xl text-body-sm hover:bg-indigo-50 active:scale-[0.98] transition-all disabled:opacity-40 disabled:scale-100"
                            >
                                {isRejected ? "Pipeline Closed" : "Complete Setup"}
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}