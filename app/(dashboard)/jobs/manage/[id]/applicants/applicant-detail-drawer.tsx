"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Application } from "@/lib/types";
import InterviewSchedulingForm from "./interview-scheduling-form";
import { createClient } from "@/lib/supabase/client";

interface NegotiationLog {
  id: string;
  call_date: string;
  call_outcome: string;
  call_notes: string | null;
}

interface ApplicantDetailDrawerProps {
  application: Application;
  jobId: string;
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
  jobId,
  isOpen,
  onClose,
  onScheduled,
}: ApplicantDetailDrawerProps) {
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

  const isNegotiating = application?.status === "negotiating";
  const candidate = application?.profiles as any;
  const resume = application?.resumes as any;

  const closeScheduleForm = useCallback(() => {
    setShowScheduleForm(false);
  }, []);

  // Reset states when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setShowScheduleForm(false);
      setShowLogForm(false);
      setSignedResumeUrl(null);
    }
  }, [isOpen]);

  // Fetch negotiation logs
  useEffect(() => {
    if (!isOpen || !isNegotiating) return;

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
  }, [isOpen, isNegotiating, application.id]);

  // Trigger the signed URL generation when the drawer opens and resume exists
  useEffect(() => {
    if (isOpen && resume?.pdf_url) {
      getSignedUrl();
    }
  }, [isOpen, resume?.pdf_url]);

  // Generate Signed URL for Resume
  async function getSignedUrl() {
    if (!resume?.pdf_url) return;

    setLoadingResume(true);
    const supabase = createClient();
    
    try {
      const fullUrl = resume.pdf_url;
      
      // 1. Extract the path after '/resumes/'
      const match = fullUrl.match(/\/resumes\/(.+)$/);
      let filePath = match ? match[1] : null;

      if (filePath) {
        // 2. Clean the path
        filePath = filePath.split('?')[0];
        const decodedPath = decodeURIComponent(filePath);
        const cleanPath = decodedPath.startsWith('/') 
          ? decodedPath.substring(1) 
          : decodedPath;

        console.log("DEBUG: Requesting signed URL for path:", cleanPath);

        const { data, error } = await supabase
          .storage
          .from('resumes')
          .createSignedUrl(cleanPath, 3600);

        if (error) {
          console.error("Supabase Storage Error:", error.message);
          setSignedResumeUrl(null);
        } else {
          setSignedResumeUrl(data.signedUrl);
        }
      }
    } catch (err) {
      console.error("Path parsing error:", err);
    } finally {
      setLoadingResume(false);
    }
  }

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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[70]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border z-[80] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {candidate?.first_name} {candidate?.last_name}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{candidate?.email}</p>
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

          {/* Match Score */}
          {application?.match_score !== null && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Match Score</h3>
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${
                  application.match_score >= 70 ? "text-green-600"
                  : application.match_score >= 40 ? "text-yellow-600"
                  : "text-red-600"
                }`}>
                  {application.match_score}%
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-full rounded-full ${
                      application.match_score >= 70 ? "bg-green-500"
                      : application.match_score >= 40 ? "bg-yellow-500"
                      : "bg-red-500"
                    }`}
                    style={{ width: `${application.match_score}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Resume Section */}
          {resume && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Resume</h3>
              {loadingResume ? (
                <div className="p-3 rounded-lg bg-gray-50 text-text-secondary text-sm animate-pulse text-center">
                  Generating secure link...
                </div>
              ) : signedResumeUrl ? (
                <a
                  href={signedResumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L9 9.414V13H5.5z" />
                  </svg>
                  <span className="text-sm font-medium">View {resume.title}</span>
                </a>
              ) : (
                <p className="text-xs text-red-500">Could not load resume link.</p>
              )}
            </div>
          )}

          {/* Application Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Application Status</h3>
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
              application?.status === "hired"                  ? "bg-green-50 text-green-700"
              : application?.status === "rejected"             ? "bg-red-50 text-red-700"
              : application?.status === "negotiating"          ? "bg-purple-50 text-purple-700"
              : application?.status === "under_review"         ? "bg-amber-50 text-amber-700"
              : application?.status === "interview_scheduled"  ? "bg-purple-50 text-purple-700"
              : "bg-blue-50 text-blue-700"
            }`}>
              {application?.status.replace(/_/g, " ")}
            </div>
          </div>

          {/* Negotiation Log Section */}
          {isNegotiating && (
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

              {/* Existing logs list */}
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
        <div className="border-t border-border p-6 space-y-3">
          <button
            onClick={() => setShowScheduleForm(true)}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-dark transition-colors"
          >
            Schedule Interview
          </button>
          <button
            onClick={onClose}
            className="w-full border border-border text-text-primary py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Schedule Interview Modal */}
      {showScheduleForm && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/50" onClick={closeScheduleForm} />
          <div className="fixed inset-0 z-[91] grid place-items-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-base font-semibold text-text-primary">Schedule Interview</h3>
                <button onClick={closeScheduleForm} className="text-text-secondary hover:text-text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              <div className="p-5">
                <InterviewSchedulingForm
                  applicationId={application.id}
                  jobId={jobId}
                  onSuccess={() => {
                    closeScheduleForm();
                    onScheduled?.();
                    onClose();
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