"use client";
// app/(dashboard)/interviews/schedule/interview-schedule-page.tsx
// HR schedules an interview.
// - Pre-fills date from ?date= query param (set by calendar click)
// - Shows candidate's online/in-person preference
// - If online: creates Daily.co room on submit

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Application {
  id: string;
  status: string;
  selected_mode: "online" | "in_person" | null;
  hr_office_address: string | null;
  hr_offered_modes: ("online" | "in_person")[] | null;
  candidate_id: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
  job_postings: {
    id: string;
    title: string;
  };
}

export default function InterviewSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill date from calendar click or applicationId from notification
  const dateParam = searchParams.get("date");        // YYYY-MM-DD
  const applicationIdParam = searchParams.get("applicationId") ?? searchParams.get("application_id");

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedApplicationId, setSelectedApplicationId] = useState(applicationIdParam ?? "");
  const [date, setDate] = useState(dateParam ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [interviewType, setInterviewType] = useState<"online" | "in_person">("online");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationNotes, setLocationNotes] = useState("");
  const [notes, setNotes] = useState("");

  // Candidate selected mode is final and authoritative.
  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const candidateSelectedMode = selectedApp?.selected_mode ?? null;

  // Update interview mode and office address defaults when application changes.
  useEffect(() => {
    if (candidateSelectedMode) {
      setInterviewType(candidateSelectedMode);
    }
    if (selectedApp?.hr_office_address) {
      setLocationAddress(selectedApp.hr_office_address);
    } else {
      setLocationAddress("");
    }
  }, [candidateSelectedMode, selectedApp?.hr_office_address]);

  // Load applications eligible for scheduling
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("applications")
        .select(`
          id,
          status,
          selected_mode,
          hr_office_address,
          hr_offered_modes,
          candidate_id,
          profiles ( first_name, last_name, email ),
          job_postings ( id, title )
        `)
        .in("status", ["shortlisted", "under_review", "interview_scheduled"])
        .order("created_at", { ascending: false });

      setApplications((data as unknown as Application[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedApplicationId || !date || !time) return;

    if (!candidateSelectedMode) {
      setError("Candidate has not selected an interview format yet.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();

      // Combine date + time into a UTC ISO string
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

      // Generate a temporary UUID for the room name (we'll replace with DB id after insert)
      const tempId = crypto.randomUUID();

      let videoRoomUrl: string | null = null;
      let videoRoomName: string | null = null;

      // If online, create Daily.co room first
      if (interviewType === "online") {
        const roomRes = await fetch("/api/interviews/daily-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId: tempId, scheduledAt }),
        });

        if (!roomRes.ok) {
          const err = await roomRes.json();
          setError(err.error ?? "Failed to create meeting room.");
          setSubmitting(false);
          return;
        }

        const roomData = await roomRes.json();
        videoRoomUrl = roomData.roomUrl;
        videoRoomName = roomData.roomName;
      }

      // Insert interview record
      const { data: interview, error: insertError } = await supabase
        .from("interviews")
        .insert({
          application_id: selectedApplicationId,
          scheduled_by: (await supabase.auth.getUser()).data.user!.id,
          interview_type: interviewType,
          status: "scheduled",
          scheduled_at: scheduledAt,
          duration_minutes: duration,
          timezone: "Asia/Manila",
          location_address: interviewType === "in_person" ? locationAddress : null,
          location_notes: interviewType === "in_person" ? locationNotes : null,
          video_room_url: videoRoomUrl,
          video_room_name: videoRoomName,
          video_provider: interviewType === "online" ? "daily.co" : null,
          interviewer_notes: notes || null,
        })
        .select()
        .single();

      if (insertError) {
        setError("Failed to save interview: " + insertError.message);
        setSubmitting(false);
        return;
      }

      // Update application status to interview_scheduled
      await supabase
        .from("applications")
        .update({ status: "interview_scheduled" })
        .eq("id", selectedApplicationId);

      // Notify the candidate
      const app = applications.find((a) => a.id === selectedApplicationId);
      if (app) {
        const formattedDate = new Date(scheduledAt).toLocaleDateString("en-PH", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        });

        const typeLabel = interviewType === "online" ? "Online" : "In-Person";
        const roomLink = videoRoomUrl ? ` Join here: ${videoRoomUrl}` : "";

        await supabase.from("notifications").insert({
          recipient_id: app.candidate_id,
          type: "interview_scheduled",
          title: `Interview Scheduled — ${app.job_postings.title}`,
          body: `Your ${typeLabel} interview has been scheduled for ${formattedDate}.${roomLink}`,
          action_url: interview ? `/interviews/${interview.id}` : "/interviews",
        });
      }

      router.push("/interviews");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/interviews"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <div>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Schedule Interview
          </h1>
          {dateParam && (
            <p className="text-xs text-text-secondary">
              Pre-filled from calendar: {new Date(`${dateParam}T00:00:00`).toLocaleDateString("en-PH", {
                weekday: "long", month: "long", day: "numeric"
              })}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Applicant */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Applicant</p>
          {loading ? (
            <div className="h-9 rounded-xl bg-gray-100 animate-pulse" />
          ) : (
            <select
              value={selectedApplicationId}
              onChange={(e) => setSelectedApplicationId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select an applicant...</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.profiles.first_name} {app.profiles.last_name} — {app.job_postings.title}
                  {app.selected_mode ? ` (selected ${app.selected_mode === "online" ? "Online" : "In-Person"})` : ""}
                </option>
              ))}
            </select>
          )}

          {/* Show candidate selection hint */}
          {candidateSelectedMode ? (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
              candidateSelectedMode === "online"
                ? "bg-blue-50 border border-blue-200 text-blue-800"
                : "bg-orange-50 border border-orange-200 text-orange-800"
            }`}>
              <span>{candidateSelectedMode === "online" ? "💻" : "🏢"}</span>
              <span>
                Candidate finalized: <strong>{candidateSelectedMode === "online" ? "Online" : "In-Person"}</strong> interview.
                Scheduling will follow this selection.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>⏳</span>
              <span>
                Waiting for candidate to confirm interview format. You can set date/time now, but scheduling is disabled until they confirm.
              </span>
            </div>
          )}
        </div>

        {/* Date & Time */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Date & Time</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>

        {/* Interview Type (read-only, based on candidate selection) */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Interview Format</p>
          <div className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary">
            {candidateSelectedMode
              ? candidateSelectedMode === "online"
                ? "💻 Online"
                : "🏢 In-Person"
              : "Pending candidate confirmation"}
          </div>

          {/* In-person fields */}
          {candidateSelectedMode === "in_person" && (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Office Address</label>
                <input
                  type="text"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  placeholder="e.g. 123 Main St, Cebu City"
                  required
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Additional Notes (optional)</label>
                <input
                  type="text"
                  value={locationNotes}
                  onChange={(e) => setLocationNotes(e.target.value)}
                  placeholder="e.g. 3rd floor, ask for reception"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* Online info */}
          {candidateSelectedMode === "online" && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2">
              <p className="text-xs text-blue-800">
                🎥 A private Daily.co meeting room will be automatically created and the link sent to the candidate.
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-2">
          <p className="text-sm font-semibold text-text-primary">Internal Notes (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Preparation notes, topics to cover, etc."
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedApplicationId || !date || !time || !candidateSelectedMode}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? interviewType === "online"
              ? "Creating meeting room..."
              : "Scheduling..."
            : "Schedule Interview"}
        </button>
      </form>
    </div>
  );
}