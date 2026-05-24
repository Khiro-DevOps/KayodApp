"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Application } from "@/lib/types";
import InterviewSchedulingForm from "./interview-scheduling-form";
import { createClient } from "@/lib/supabase/client";
import { moveToScreening, confirmInterviewScheduled } from "./pipeline-actions";
import { getCurrentStage } from "@/lib/pipeline";

interface NegotiationLog {
  id: string;
  call_date: string;
  call_outcome: string;
  call_notes: string | null;
}

interface MatchScoreBreakdown {
  score_total: number;
  score_skills: number | null;
  score_title: number | null;
  score_experience: number | null;
  score_education: number | null;
  score_setup: number | null;
  reasons: string[] | null;
  computed_at: string | null;
}

interface ApplicantDetailDrawerProps {
  application: Application;
  jobOffer?: {
    status?: string | null;
  };
  jobId: string;
  initialTab?: string | null;
  isCompletedLocked?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: () => void;
}

const outcomeConfig: Record<string, { label: string; color: string }> = {
  agreed:           { label: "✅ Agreed",            color: "bg-green-50 text-green-700 border-green-200" },
  no_answer:        { label: "📵 No Answer",          color: "bg-gray-100 text-gray-600 border-gray-200"  },
  counter_offered:  { label: "🔄 Counter Offered",    color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  declined:         { label: "❌ Declined",            color: "bg-red-50 text-red-700 border-red-200"     },
  follow_up_needed: { label: "📅 Follow-up Needed",   color: "bg-blue-50 text-blue-700 border-blue-200"  },
};

export default function ApplicantDetailDrawer({
  application,
  jobOffer,
  jobId,
  initialTab,
  isCompletedLocked = false,
  isOpen,
  onClose,
  onScheduled,
}: ApplicantDetailDrawerProps) {
  const router = useRouter();
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  // ── Negotiation state ────────────────────────────────────────────────────
  const [logs, setLogs] = useState<NegotiationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [callOutcome, setCallOutcome] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [callDate, setCallDate] = useState(new Date().toISOString().slice(0, 16));
  const [savingLog, setSavingLog] = useState(false);

  // ── Resume Signed URL state ──────────────────────────────────────────────
  const [signedResumeUrl, setSignedResumeUrl] = useState<string | null>(null);
  const [loadingResume, setLoadingResume] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [matchScoreDetails, setMatchScoreDetails] = useState<MatchScoreBreakdown | null>(null);
  const [loadingMatchScore, setLoadingMatchScore] = useState(false);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);

  const candidate = application?.profiles as any;
  const resume = (Array.isArray(application?.resumes)
    ? application.resumes[0]
    : application?.resumes) as any;
  const currentStage = getCurrentStage(application?.status);
  const normalizedAppStatus = String(application?.status ?? "").toLowerCase();
  const normalizedOfferStatus = String(jobOffer?.status ?? "").toUpperCase();
  const isOfferStage = ["offer_sent", "negotiating"].includes(normalizedAppStatus);
  const offerHasBeenSent = [
    "SENT",
    "NEGOTIATION_PENDING",
    "REVISED",
    "ACCEPTED",
    "SIGNED",
    "HIRED",
    "HIRE_CONFIRMED",
    "DECLINED",
    "EXPIRED",
  ].includes(normalizedOfferStatus);
  const shouldShowOfferNotSent = isOfferStage && !!jobOffer && !offerHasBeenSent;

  const displayStatus = shouldShowOfferNotSent
    ? "Offer"
    : currentStage?.label ?? application?.status.replace(/_/g, " ").toUpperCase();

  const statusTone = shouldShowOfferNotSent
    ? "bg-amber-50 text-amber-700"
    : currentStage?.key === "new"
    ? "bg-blue-50 text-blue-700"
    : currentStage?.key === "screening"
      ? "bg-amber-50 text-amber-700"
      : currentStage?.key === "interview"
        ? "bg-purple-50 text-purple-700"
        : currentStage?.key === "offer"
          ? "bg-orange-50 text-orange-700"
          : currentStage?.key === "hired"
            ? "bg-green-50 text-green-700"
            : "bg-blue-50 text-blue-700";

  const canReschedule =
    String(application?.status ?? "").toUpperCase() !== "COMPLETED" && !isCompletedLocked;
  const breakdownRows = [
    { label: "Skills", value: matchScoreDetails?.score_skills ?? 0, weight: "40%" },
    { label: "Title", value: matchScoreDetails?.score_title ?? 0, weight: "25%" },
    { label: "Experience", value: matchScoreDetails?.score_experience ?? 0, weight: "15%" },
    { label: "Education", value: matchScoreDetails?.score_education ?? 0, weight: "10%" },
    { label: "Work Setup", value: matchScoreDetails?.score_setup ?? 0, weight: "10%" },
  ];
  const drawerPrimaryAction = (() => {
    if (initialTab === "send_offer" || shouldShowOfferNotSent) {
      return {
        label: "Send Offer",
        color: "bg-orange-600 text-white",
        onClick: () => router.push(`/jobs/manage/${jobId}/applicants/${application.id}/offer`),
      };
    }

    if (initialTab === "view_offer" || ["negotiating", "offer_sent"].includes(normalizedAppStatus) || offerHasBeenSent) {
      return {
        label: "Open Offer Page",
        color: "bg-orange-600 text-white",
        onClick: () => router.push(`/jobs/manage/${jobId}/applicants/${application.id}/offer`),
      };
    }

    if (initialTab === "view_interview" || application?.status === "interview_scheduled") {
      return {
        label: "View Scheduled Interview",
        color: "bg-primary text-white",
        onClick: () => router.push("/interviews"),
      };
    }

    if (["under_review", "shortlisted", "interviewed"].includes(application?.status)) {
      return {
        label: "Schedule Interview",
        color: "bg-primary text-white",
        onClick: () => router.push(`/interviews/schedule?applicationId=${encodeURIComponent(application.id)}`),
      };
    }

    if (["submitted", "draft"].includes(application?.status)) {
      return {
        label: "Move to Screening",
        color: "bg-amber-600 text-white",
        onClick: async () => {
          const result = await moveToScreening(application.id);
          if (!result.success) {
            toast.error(result.error || "Failed to move to screening");
            return;
          }
          toast.success(`✓ ${result.applicantName} moved to Screening`);
          router.refresh();
        },
      };
    }

    return null;
  })();

  const closeScheduleForm = useCallback(() => {
    setShowScheduleForm(false);
  }, []);

  // Reset states when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setShowScheduleForm(false);
      setShowLogForm(false);
      setSignedResumeUrl(null);
      setResumeError(null);
      setMatchScoreDetails(null);
      setLoadingMatchScore(false);
    }
  }, [isOpen]);

  // Fetch negotiation logs
  useEffect(() => {
    if (!isOpen) return;

    async function fetchLogs() {
      setLoadingLogs(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("negotiation_logs")
        .select("*")
        .eq("application_id", application.id)
        .order("call_date", { ascending: false });
      setLogs((data as NegotiationLog[]) ?? []);
      setLoadingLogs(false);
    }
    fetchLogs();
  }, [isOpen, application.id]);

  useEffect(() => {
    if (!isOpen || !resume?.id) return;

    async function fetchSignedUrl() {
      setLoadingResume(true);
      setResumeError(null);
      setSignedResumeUrl(null);

      const supabase = createClient();

      try {
        const pdfUrl = resume?.pdf_url;

        if (!pdfUrl) {
          console.warn("resume.pdf_url is missing. Full resume object:", resume);
          setResumeError("No PDF URL found for this resume.");
          return;
        }

        const match = pdfUrl.match(/\/resumes\/(.+)$/);
        const rawPath = match ? match[1] : null;

        if (!rawPath) {
          console.warn("Could not extract path from URL:", pdfUrl);
          setResumeError("Could not parse resume storage path.");
          return;
        }

        const cleanPath = decodeURIComponent(rawPath.split("?")[0]);
        const storagePath = cleanPath.startsWith("/") ? cleanPath.substring(1) : cleanPath;

        const { data, error } = await supabase.storage
          .from("resumes")
          .createSignedUrl(storagePath, 3600);

        if (error) {
          console.error("Supabase Storage Error:", error.message);
          setResumeError(error.message || "Failed to generate signed URL.");
          setSignedResumeUrl(null);
        } else {
          setSignedResumeUrl(data.signedUrl);
        }
      } catch (err: any) {
        console.error("Signed URL fetch error:", err);
        setResumeError(String(err?.message ?? err));
        setSignedResumeUrl(null);
      } finally {
        setLoadingResume(false);
      }
    }

    fetchSignedUrl();
  }, [isOpen, resume?.id]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    async function fetchMatchScore() {
      setLoadingMatchScore(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("match_scores")
        .select("score_total, score_skills, score_title, score_experience, score_education, score_setup, reasons, computed_at")
        .eq("applicant_id", application.candidate_id)
        .eq("job_id", jobId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error("Failed to load match score breakdown:", error);
        setMatchScoreDetails(null);
      } else {
        setMatchScoreDetails((data as MatchScoreBreakdown | null) ?? null);
      }

      setLoadingMatchScore(false);
    }

    fetchMatchScore();

    return () => {
      active = false;
    };
  }, [isOpen, application.candidate_id, jobId]);

  // Close resume modal on Escape
  useEffect(() => {
    if (!showResumeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowResumeModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showResumeModal]);

  useEffect(() => {
    if (!showScheduleForm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeScheduleForm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showScheduleForm, closeScheduleForm]);

  async function handleSaveLog() {
    if (!callOutcome) return;
    setSavingLog(true);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { data: newLog, error } = await supabase
      .from("negotiation_logs")
      .insert({
        application_id: application.id,
        logged_by: user?.id,
        call_date: new Date(callDate).toISOString(),
        call_outcome: callOutcome,
        call_notes: callNotes || null,
      })
      .select()
      .single();

    if (!error && newLog) {
      setLogs((prev) => [newLog as NegotiationLog, ...prev]);
    }

    setCallOutcome("");
    setCallNotes("");
    setCallDate(new Date().toISOString().slice(0, 16));
    setShowLogForm(false);
    setSavingLog(false);
  }

  const matchScorePill = application.match_score !== null
    ? {
        label: `Match Score: ${application.match_score}%`,
        className: application.match_score >= 75
          ? "bg-green-100 text-green-700"
          : application.match_score >= 50
            ? "bg-amber-100 text-amber-700"
            : "bg-red-100 text-red-700"
      }
    : { label: "Calculating...", className: "bg-gray-100 text-gray-400" };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[70]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border z-[80] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-text-primary">
                {candidate?.first_name} {candidate?.last_name}
              </h2>
            </div>
            <p className="text-sm text-text-secondary mt-1">{candidate?.email}</p>
            {/* Inline Match Breakdown removed — use the modal to view detailed breakdown */}
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Contact Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Contact Information</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-text-secondary mb-1">Email</p>
                <p className="text-text-primary">{candidate?.email}</p>
              </div>
              {candidate?.phone && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">Phone</p>
                  <p className="text-text-primary">{candidate.phone}</p>
                </div>
              )}
              {candidate?.city && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">Location</p>
                  <p className="text-text-primary">{candidate.city}, {candidate.country}</p>
                </div>
              )}
            </div>
          </div>

          {/* Resume Section */}
          {resume && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Resume</h3>

              {loadingResume ? (
                <div className="p-3 rounded-lg bg-gray-50 text-text-secondary text-sm animate-pulse text-center">
                  Generating secure link...
                </div>
              ) : signedResumeUrl ? (
                <div className="flex items-center gap-4 py-2">
                  <span className="text-sm font-semibold text-text-primary"></span>
                  <button
                    onClick={() => setShowResumeModal(true)}
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    {resume.title || resume.name || "View Resume"}
                  </button>
                  <span
                    onClick={() => setIsScoreModalOpen(true)}
                    className={`ml-auto rounded px-2 py-1 text-xs font-bold cursor-pointer ${matchScorePill.className}`}>
                    {matchScorePill.label}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-red-500">
                  {resumeError ?? "Could not load resume link."}
                </p>
              )}
            </div>
          )}

          {/* Application Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Pipeline Stage</h3>
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${statusTone}`}>
              {displayStatus}
            </div>
            <p className="text-xs text-text-secondary">
              Status: {shouldShowOfferNotSent ? "OFFER NOT SENT" : application?.status.replace(/_/g, " ").toUpperCase()}
            </p>
          </div>

          {/* Negotiation Log Section */}
          {false && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">📞 Negotiation Log</h3>
                <button
                  onClick={() => setShowLogForm((prev) => !prev)}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  {showLogForm ? "Cancel" : "+ Log a Call"}
                </button>
              </div>

              {showLogForm && (
                <div className="rounded-2xl border border-border bg-gray-50 p-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-text-secondary">Call Date & Time</label>
                    <input
                      type="datetime-local"
                      value={callDate}
                      onChange={(e) => setCallDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-text-secondary">Call Outcome <span className="text-red-500">*</span></label>
                    <select
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select outcome...</option>
                      <option value="agreed">✅ Agreed</option>
                      <option value="no_answer">📵 No Answer</option>
                      <option value="counter_offered">🔄 Counter Offered</option>
                      <option value="declined">❌ Declined</option>
                      <option value="follow_up_needed">📅 Follow-up Needed</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-text-secondary">Notes</label>
                    <textarea
                      rows={3}
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      placeholder="What was discussed?"
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSaveLog}
                    disabled={!callOutcome || savingLog}
                    className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {savingLog ? "Saving..." : "Save Call Log"}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {loadingLogs ? (
                  <p className="text-xs text-text-secondary">Loading logs...</p>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-text-secondary italic">No calls logged yet.</p>
                ) : (
                  logs.map((log) => {
                    const config = outcomeConfig[log.call_outcome] || { label: log.call_outcome, color: "" };
                    return (
                      <div key={log.id} className="rounded-xl border border-border bg-white p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${config.color}`}>{config.label}</span>
                          <span className="text-[10px] text-text-secondary">
                            {new Date(log.call_date).toLocaleDateString()}
                          </span>
                        </div>
                        {log.call_notes && <p className="text-xs text-text-secondary">{log.call_notes}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-6 space-y-3 shrink-0">
          {drawerPrimaryAction ? (
            <button
              onClick={() => {
                void drawerPrimaryAction.onClick();
              }}
              className={`w-full py-2.5 rounded-lg font-medium transition-colors ${drawerPrimaryAction.color}`}
            >
              {drawerPrimaryAction.label}
            </button>
          ) : (
            <button
              onClick={() => {
                if (canReschedule) {
                  router.push(`/interviews/schedule?applicationId=${encodeURIComponent(application.id)}`);
                }
              }}
              disabled={!canReschedule}
              className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {canReschedule ? "Schedule Interview" : "Interview Completed"}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full border border-border text-text-primary py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Resume Preview Modal */}
      {showResumeModal && signedResumeUrl && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/50" onClick={() => setShowResumeModal(false)} />
          <div className="fixed inset-0 z-[91] grid place-items-center p-4">
            <div className="w-full max-w-4xl rounded-2xl border border-border bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="text-base font-semibold text-text-primary">
                  {resume.title || "Resume Preview"}
                </h3>
                <button
                  onClick={() => setShowResumeModal(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <iframe
                  src={signedResumeUrl}
                  className="w-full h-[80vh]"
                  title="Resume Preview"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <a
                    href={signedResumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Open in new tab
                  </a>
                  <button
                    onClick={() => setShowResumeModal(false)}
                    className="px-4 py-2 bg-gray-200 rounded text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Match Breakdown Modal (portal) */}
      {isScoreModalOpen && createPortal(
        <div
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={() => setIsScoreModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text-primary">Match Breakdown</h2>
              <button onClick={() => setIsScoreModalOpen(false)}>✕</button>
            </div>

            {loadingMatchScore ? (
              <p className="text-sm text-text-secondary">Loading...</p>
            ) : matchScoreDetails ? (
              <div className="space-y-3">
                {breakdownRows.map((row) => {
                  const value = Math.max(0, Math.min(100, row.value));
                  const barColor = value >= 75 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <div key={row.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-text-primary font-medium">{row.label}</span>
                        <span className="text-text-secondary">{value}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`${barColor} h-full`} style={{ width: `${value}%` }} />
                      </div>
                      <div className="text-xs text-text-secondary">{row.weight}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Score pending</p>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Schedule Interview Modal — fixed height with scrollable content */}
      {showScheduleForm && canReschedule && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/50" onClick={closeScheduleForm} />
          <div className="fixed inset-0 z-[91] grid place-items-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl flex flex-col max-h-[90vh]">
              {/* Fixed header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
                <h3 className="text-base font-semibold text-text-primary">Schedule Interview</h3>
                <button onClick={closeScheduleForm} className="text-text-secondary hover:text-text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 p-5">
                <InterviewSchedulingForm
                  applicationId={application.id}
                  jobId={jobId}
                  onSuccess={async () => {
                    // Update application status to interview_scheduled
                    const result = await confirmInterviewScheduled(application.id);
                    if (result.success) {
                      closeScheduleForm();
                      onScheduled?.();
                      onClose();
                    }
                  }}
                  onCancel={closeScheduleForm}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}