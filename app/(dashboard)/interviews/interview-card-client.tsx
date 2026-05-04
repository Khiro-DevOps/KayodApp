"use client";

import { Interview } from "@/lib/types";
import { updateInterviewPreference } from "./actions";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import HRJitsiRoom from "@/components/interviews/HRJitsiRoom";
import ApplicantJitsiRoom from "@/components/interviews/ApplicantJitsiRoom";
import { createClient } from "@/lib/supabase/client";


interface InterviewCardClientProps {
  interview: Interview;
  isHR: boolean;
  past?: boolean;
  showTypeSelection?: boolean;
}

type NotesStep = "idle" | "notepad" | "done";

export function InterviewCardClient({
  interview,
  isHR,
  past = false,
  showTypeSelection = false,
}: InterviewCardClientProps) {
  const router = useRouter();
  const [isSelecting, setIsSelecting] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [notesStep, setNotesStep] = useState<NotesStep>("idle");
  const [saving, setSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompletedLocally, setIsCompletedLocally] = useState(interview.status === "completed");
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Notepad fields
  const [score, setScore] = useState<number | "">("");
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [cultureFit, setCultureFit] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");

useEffect(() => {
  if (past) return;

  const scheduledDate = new Date(interview.scheduled_at);
  const openTime = new Date(scheduledDate.getTime() - 15 * 60 * 1000);
  const msUntilOpen = openTime.getTime() - Date.now();

  if (msUntilOpen > 0 && msUntilOpen < 30 * 60 * 1000) {
    const timer = setTimeout(() => router.refresh(), msUntilOpen);
    return () => clearTimeout(timer);
  }
}, [past, interview.scheduled_at, router]);

  const app = interview.applications as unknown as {
    id?: string;
    profiles?: { first_name: string; last_name: string; email: string };
    job_postings?: { title: string };
  };

  const candidateName = app?.profiles
    ? `${app.profiles.first_name} ${app.profiles.last_name}`
    : "Candidate";
  const jobTitle = app?.job_postings?.title ?? "Position";
  const scheduledDate = new Date(interview.scheduled_at);
  const now = new Date();

  // ── Ongoing window logic ─────────────────────────────────────────────────
  const endTime = new Date(
    scheduledDate.getTime() + (interview.duration_minutes ?? 60) * 60000
  );
  const openTime = new Date(scheduledDate.getTime() - 15 * 60000);
  const isOngoing = now >= openTime && now < endTime;
  const isExpired = now >= endTime;

  const canJoinRoom =
    interview.interview_type === "online" &&
    interview.video_room_url &&
    !isExpired &&
    isOngoing &&
    interview.status !== "cancelled" &&
    interview.status !== "completed";

  const canCompleteInterview =
    isHR && !isCompletedLocally && interview.status !== "cancelled" && interview.status !== "completed";

  const roomName =
    interview.video_room_name ??
    interview.video_room_url?.split("/").pop() ??
    `kayod-interview-${interview.id}`;

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700",
    confirmed: "bg-green-50 text-green-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-50 text-red-700",
    rescheduled: "bg-yellow-50 text-yellow-700",
    no_show: "bg-red-50 text-red-600",
    ongoing: "bg-green-100 text-green-700",
  };

  const displayStatus =
    interview.status === "scheduled" && isOngoing
      ? "ongoing"
      : interview.status === "scheduled" && isExpired
      ? "completed"
      : interview.status;

  const handleTypeSelection = async (type: "online" | "in_person") => {
    const formData = new FormData();
    formData.append("interview_id", interview.id);
    formData.append("interview_type", type);
    await updateInterviewPreference(formData);
  };

  async function completeInterviewOnce() {
    if (isCompletedLocally) {
      return true;
    }

    const response = await fetch(`/api/interviews/${interview.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to complete interview" }));
      throw new Error(payload?.error || "Failed to complete interview");
    }

    setIsCompletedLocally(true);
    return true;
  }

  // ── Save notepad + put applicant on hold ─────────────────────────────────
  async function handleSaveNotepad() {
    setSaving(true);
    setCompleteError(null);
    const supabase = createClient();

    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("interview_notes").upsert({
        interview_id: interview.id,
        application_id: app.id,
        created_by: userData.user?.id,
        interview_score: score === "" ? null : Number(score),
        strengths: strengths || null,
        concerns: concerns || null,
        culture_fit: cultureFit || null,
        recommendation: recommendation || null,
        general_notes: generalNotes || null,
      }, { onConflict: "interview_id" });

      if (app.id) {
        const { data: appData } = await supabase
          .from("applications")
          .select("candidate_id, job_postings(title)")
          .eq("id", app.id)
          .single();

        if (appData?.candidate_id) {
          await supabase.from("notifications").insert({
            recipient_id: appData.candidate_id,
            type: "under_review",
            title: "📋 Your interview has been reviewed",
            body: `Your interview for ${(appData.job_postings as any)?.title ?? "the position"} is under review. We'll be in touch soon.`,
            action_url: `/applications`,
            is_read: false,
          });
        }
      }

      setNotesStep("done");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error finalizing interview";
      setCompleteError(message);
      console.error("Error finalizing interview:", error);
    } finally {
      setSaving(false);
    }
  }

  // ── Applicant leave ──────────────────────────────────────────────────────
  const handleApplicantLeave = useCallback(() => {
    router.push("/interviews/thank-you");
  }, [router]);

  // ── Complete interview from card ─────────────────────────────────────────
  const handleCompleteFromCard = async () => {
    setIsCompleting(true);
    setCompleteError(null);
    try {
      await completeInterviewOnce();
      setShowRoom(false);
      setNotesStep("notepad");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to complete interview";
      setCompleteError(message);
      console.error("Failed to complete interview:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  // ── Fullscreen Jitsi — HR ────────────────────────────────────────────────
  if (showRoom && isHR) {
    return (
      <div className="space-y-3">
        <HRJitsiRoom
          roomName={roomName}
          displayName="HR Interviewer"
          interviewId={interview.id}
          onClose={() => setShowRoom(false)}
        />
        <button
          onClick={() => void handleCompleteFromCard()}
          disabled={isCompleting}
          className="w-full rounded-xl bg-green-600 hover:bg-green-700 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          {isCompleting ? "Completing..." : "End Interview & Write Notes"}
        </button>
      </div>
    );
  }

  // ── Fullscreen Jitsi — Applicant ─────────────────────────────────────────
  if (showRoom && !isHR) {
    return (
      <ApplicantJitsiRoom
        roomName={roomName}
        userName="Applicant"
        onLeave={handleApplicantLeave}
      />
    );
  }

  // ── Notepad screen ───────────────────────────────────────────────────────
  if (notesStep === "notepad" && isHR) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-5 space-y-4">
        {/* Header */}
        <div>
          <h3 className="text-sm font-bold text-text-primary">
            📝 Interview Notepad
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {candidateName} · {jobTitle}
          </p>
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
            The applicant will be placed <strong>on hold</strong> for comparison with other candidates. You can send a Job Offer from the Review Board later.
          </p>
        </div>

        {/* Score */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            Interview Score (0–100)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="e.g. 82"
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Strengths */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            Strengths
          </label>
          <textarea
            rows={2}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            placeholder="What stood out positively about this candidate?"
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Concerns */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            Concerns
          </label>
          <textarea
            rows={2}
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            placeholder="Any red flags or areas of concern?"
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Culture Fit */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            Culture Fit
          </label>
          <textarea
            rows={2}
            value={cultureFit}
            onChange={(e) => setCultureFit(e.target.value)}
            placeholder="How well do they align with the team and company culture?"
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {/* Recommendation */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            Recommendation
          </label>
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select a recommendation...</option>
            <option value="strongly_recommend">⭐⭐⭐ Strongly Recommend</option>
            <option value="recommend">⭐⭐ Recommend</option>
            <option value="neutral">⭐ Neutral</option>
            <option value="do_not_recommend">❌ Do Not Recommend</option>
          </select>
        </div>

        {/* General Notes */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">
            General Notes
          </label>
          <textarea
            rows={3}
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="Anything else worth noting about this interview..."
            className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {completeError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {completeError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setNotesStep("idle")}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveNotepad}
            disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save & Put on Hold"}
          </button>
        </div>
      </div>
    );
  }

  // ── Type selection ───────────────────────────────────────────────────────
  if (isSelecting && showTypeSelection && !past) {
    return (
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {isHR ? candidateName : jobTitle}
            </p>
            <p className="text-xs text-text-secondary">Choose interview type</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[displayStatus] ?? "bg-gray-100 text-gray-600"}`}>
            {displayStatus.replace("_", " ")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleTypeSelection("online")}
            className="rounded-xl border-2 border-primary bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10"
          >
            <p className="text-lg mb-1">🎥</p>
            <p className="text-sm font-medium text-text-primary">Online</p>
            <p className="text-xs text-text-secondary">Video Call</p>
          </button>
          <button
            onClick={() => handleTypeSelection("in_person")}
            className="rounded-xl border-2 border-border bg-surface p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <p className="text-lg mb-1">🏢</p>
            <p className="text-sm font-medium text-text-primary">In-Person</p>
            <p className="text-xs text-text-secondary">Office Visit</p>
          </button>
        </div>
        <button
          onClick={() => setIsSelecting(false)}
          className="w-full rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Main card ────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-2xl bg-surface border border-border p-4 space-y-3 ${past ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {isHR ? candidateName : jobTitle}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {isHR ? jobTitle : "Interview"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[displayStatus] ?? "bg-gray-100 text-gray-600"}`}>
          {displayStatus === "ongoing" ? "🟢 Ongoing" : displayStatus.replace(/_/g, " ")}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M5.75 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM10.25 7.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM9.5 10.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM7.25 8.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z" />
            <path fillRule="evenodd" d="M4.75 1a.75.75 0 0 0-.75.75V3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2V1.75a.75.75 0 0 0-1.5 0V3h-5V1.75A.75.75 0 0 0 4.75 1ZM3.5 7a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
          </svg>
          {scheduledDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
          {" · "}{interview.duration_minutes} min
        </span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${interview.interview_type === "online" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"}`}>
          {interview.interview_type === "online" ? "Online" : "In-person"}
        </span>
      </div>

      {/* Notepad saved confirmation */}
      {notesStep === "done" && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
          📋 Notes saved. Applicant is on hold — visit the <strong>Review Board</strong> to compare and finalize decisions.
        </div>
      )}

      {/* Join button */}
      {canJoinRoom && (
        <button
          onClick={() => {
            if (isExpired) return;
            setShowRoom(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.25 4A2.25 2.25 0 0 0 1 6.25v7.5A2.25 2.25 0 0 0 3.25 16h7.5A2.25 2.25 0 0 0 13 13.75v-7.5A2.25 2.25 0 0 0 10.75 4h-7.5ZM19 4.75a.75.75 0 0 0-1.28-.53l-3 3a.75.75 0 0 0-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 0 0 1.28-.53V4.75Z" />
          </svg>
          Join Meeting
        </button>
      )}

      {/* End Interview — HR only, available even after the meeting window closes */}
      {canCompleteInterview && (
        <button
          onClick={() => void handleCompleteFromCard()}
          disabled={isCompleting}
          className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCompleting
            ? "Completing..."
            : canJoinRoom
            ? "End Interview & Write Notes"
            : "Mark Complete & Write Notes"}
        </button>
      )}

      {completeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {completeError}
        </div>
      )}

      {/* Expired room message */}
      {interview.interview_type === "online" && interview.video_room_url && isExpired && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          The meeting window has ended — this room is no longer available.
        </div>
      )}

      {/* Room not yet open */}
      {interview.interview_type === "online" &&
        interview.video_room_url &&
        !isOngoing &&
        !isExpired &&
        interview.status !== "completed" &&
        interview.status !== "cancelled" && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            Room opens 15 minutes before the scheduled time.
          </div>
        )}

      {/* In-person location */}
      {interview.interview_type === "in_person" && interview.location_address && (
        <p className="text-xs text-text-secondary bg-amber-50 rounded-xl px-3 py-2">
          📍 {interview.location_address}
          {interview.location_notes && ` — ${interview.location_notes}`}
        </p>
      )}

      {/* Change type (applicant only) */}
      {showTypeSelection && !past && !isSelecting && (
        <button
          onClick={() => setIsSelecting(true)}
          className="w-full rounded-lg text-sm text-primary hover:bg-primary/5 px-3 py-2 transition-colors"
        >
          Change interview type
        </button>
      )}
    </div>
  );
}