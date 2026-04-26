"use client";

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
  profiles: { first_name: string; last_name: string; email: string; };
  job_postings: { id: string; title: string; };
}

export default function InterviewSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const applicationIdParam = searchParams.get("applicationId") ?? searchParams.get("application_id");

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedApplicationId, setSelectedApplicationId] = useState(applicationIdParam ?? "");
  const [date, setDate] = useState(dateParam ?? "");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [interviewType, setInterviewType] = useState<"online" | "in_person">("online");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationNotes, setLocationNotes] = useState("");
  const [notes, setNotes] = useState("");

  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const candidateSelectedMode = selectedApp?.selected_mode ?? null;

  useEffect(() => {
    if (candidateSelectedMode) setInterviewType(candidateSelectedMode);
    if (selectedApp?.hr_office_address) setLocationAddress(selectedApp.hr_office_address);
    else setLocationAddress("");
  }, [candidateSelectedMode, selectedApp?.hr_office_address]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("applications")
        .select(`id, status, selected_mode, hr_office_address, hr_offered_modes, candidate_id, profiles ( first_name, last_name, email ), job_postings ( id, title )`)
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
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      
      let videoRoomUrl: string | null = null;
      let videoRoomName: string | null = null;

      if (interviewType === "online") {
        // Generate Jitsi Link instantly
        videoRoomName = `kayod-int-${selectedApplicationId.slice(0, 8)}`;
        videoRoomUrl = `https://meet.jit.si/${videoRoomName}`;
      }

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
          video_provider: interviewType === "online" ? "jitsi" : null,
          interviewer_notes: notes || null,
        })
        .select().single();

      if (insertError) throw new Error(insertError.message);

      await supabase.from("applications").update({ status: "interview_scheduled" }).eq("id", selectedApplicationId);

      const app = applications.find((a) => a.id === selectedApplicationId);
      if (app) {
        const formattedDate = new Date(scheduledAt).toLocaleDateString("en-PH", {
          month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
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
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/interviews" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-text-primary">Schedule Interview</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Applicant</p>
          <select value={selectedApplicationId} onChange={(e) => setSelectedApplicationId(e.target.value)} required className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm">
            <option value="">Select an applicant...</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>{app.profiles.first_name} {app.profiles.last_name} — {app.job_postings.title}</option>
            ))}
          </select>
          {candidateSelectedMode && (
            <div className={`rounded-xl px-3 py-2 text-xs ${candidateSelectedMode === "online" ? "bg-blue-50 text-blue-800" : "bg-orange-50 text-orange-800"}`}>
              {candidateSelectedMode === "online" ? "💻 Online" : "🏢 In-Person"} interview selected by candidate.
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Date & Time</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="rounded-xl border border-border p-2 text-sm" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="rounded-xl border border-border p-2 text-sm" />
          </div>
        </div>

        {candidateSelectedMode === "online" && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
            🎥 A Jitsi meeting room will be automatically generated.
          </div>
        )}

        <button type="submit" disabled={submitting || !candidateSelectedMode} className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? "Scheduling..." : "Schedule Interview"}
        </button>
      </form>
    </div>
  );
}