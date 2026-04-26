"use client";
// app/(dashboard)/interviews/[id]/interview-room-page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import ApplicantJitsiRoom from "@/components/interviews/ApplicantJitsiRoom";
import HRJitsiRoom from "@/components/interviews/HRJitsiRoom";

interface Interview {
  id: string;
  interview_type: "online" | "in_person";
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  video_room_url: string | null;
  video_room_name: string | null;
  location_address: string | null;
  location_notes: string | null;
  applications: {
    candidate_id?: string;
    job_postings?: { title?: string } | null;
    profiles?: { first_name?: string; last_name?: string } | null;
  } | null;
}

interface Props {
  interviewId: string;
}

export default function InterviewRoomPage({ interviewId }: Props) {
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [isHR, setIsHR] = useState(false);
  const [userName, setUserName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<{ name: string; user: string } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, first_name, last_name")
        .eq("id", user.id)
        .single();

      const hrRole = profile?.role === "hr_manager" || profile?.role === "admin";
      setIsHR(hrRole);

      // Set display name for Jitsi
      const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
      setUserName(fullName || (hrRole ? "HR Interviewer" : "Applicant"));

      const { data, error: fetchError } = await supabase
        .from("interviews")
        .select(`
          id, interview_type, status, scheduled_at, duration_minutes,
          video_room_url, video_room_name, location_address, location_notes,
          applications (
            candidate_id,
            job_postings ( title ),
            profiles ( first_name, last_name )
          )
        `)
        .eq("id", interviewId)
        .single();

      if (fetchError || !data) {
        setError("Interview not found.");
      } else {
        setInterview(data as unknown as Interview);
      }

      setLoading(false);
    }
    load();
  }, [interviewId]);

  async function markCompleted() {
    const supabase = createClient();
    await supabase
      .from("interviews")
      .update({ status: "completed" })
      .eq("id", interviewId);
    setInterview((prev) => prev ? { ...prev, status: "completed" } : prev);
  }

  // useCallback prevents the Jitsi useEffect from re-firing on every render
  const handleHRLeave = useCallback(() => {
    setActiveRoom(null);
  }, []);

  const handleApplicantLeave = useCallback(() => {
    router.push("/interviews/thank-you");
  }, [router]);

  // ── Jitsi fullscreen takeover ────────────────────────────────────────────
  if (activeRoom) {
    return isHR ? (
      <HRJitsiRoom
        roomName={activeRoom.name}
        displayName={activeRoom.user}
        onClose={handleHRLeave}
      />
    ) : (
      <ApplicantJitsiRoom
        roomName={activeRoom.name}
        userName={activeRoom.user}
        onLeave={handleApplicantLeave}
      />
    );
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-sm text-text-secondary">Loading interview...</div>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="max-w-md mx-auto space-y-4 pt-8 text-center">
        <p className="text-sm text-text-secondary">{error ?? "Interview not found."}</p>
        <Link href="/interviews" className="text-sm text-primary underline underline-offset-2">
          Back to Interviews
        </Link>
      </div>
    );
  }

  const app = interview.applications;
  const jobTitle = app?.job_postings?.title ?? "Interview";
  const candidate = app?.profiles;
  const candidateName = candidate
    ? `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || "Candidate"
    : "Candidate";

  const scheduledDate = new Date(interview.scheduled_at);
  const now = new Date();
  const minutesUntil = Math.floor((scheduledDate.getTime() - now.getTime()) / 60000);
  const endTime = new Date(scheduledDate.getTime() + (interview.duration_minutes ?? 60) * 60000);
  const canJoin = minutesUntil <= 15 && now < endTime && interview.status !== "cancelled";


  const roomName = interview.video_room_url?.split("/").pop() || interview.video_room_name || "interview-room";

  // ── In-person interview ──────────────────────────────────────────────────
  if (interview.interview_type === "in_person") {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link
            href="/interviews"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            In-Person Interview
          </h1>
        </div>

        <div className="rounded-2xl bg-surface border border-border p-5 space-y-4">
          <div>
            <p className="text-xs text-text-secondary">Position</p>
            <p className="text-sm font-semibold text-text-primary">{jobTitle}</p>
          </div>
          {isHR && (
            <div>
              <p className="text-xs text-text-secondary">Candidate</p>
              <p className="text-sm text-text-primary">{candidateName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-text-secondary">When</p>
            <p className="text-sm text-text-primary">
              {scheduledDate.toLocaleDateString("en-PH", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
            </p>
          </div>
          {interview.location_address && (
            <div>
              <p className="text-xs text-text-secondary">Location</p>
              <p className="text-sm text-text-primary">{interview.location_address}</p>
              {interview.location_notes && (
                <p className="text-xs text-text-secondary mt-0.5">{interview.location_notes}</p>
              )}
            </div>
          )}
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-xs text-text-secondary">
              🏢 This is an in-person interview. Please arrive on time at the location above.
            </p>
          </div>
        </div>

        {isHR && interview.status === "scheduled" && (
          <button
            onClick={markCompleted}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Mark as Completed
          </button>
        )}
      </div>
    );
  }

  // ── Online interview — pre-join lobby ────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
            <h1 className="font-(family-name:--font-heading) text-lg font-bold text-text-primary">
              {jobTitle}
            </h1>
            <p className="text-xs text-text-secondary">
              Online Interview •{" "}
              {scheduledDate.toLocaleDateString("en-PH", {
                month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit",
              })}
              {" "}• {interview.duration_minutes} min
            </p>
          </div>
        </div>

        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          interview.status === "completed"
            ? "bg-green-100 text-green-700"
            : interview.status === "cancelled"
            ? "bg-red-100 text-red-700"
            : "bg-blue-100 text-blue-700"
        }`}>
          {interview.status.charAt(0).toUpperCase() + interview.status.slice(1)}
        </span>
      </div>

      {!interview.video_room_url ? (
        <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-text-primary">Meeting room unavailable</p>
          <p className="text-xs text-text-secondary">
            The online meeting room has not been set up yet. Please contact HR.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="text-4xl">🎥</div>
            <p className="text-sm font-semibold text-text-primary">Ready to join?</p>
            <p className="text-xs text-text-secondary">
              {canJoin
                ? "The meeting is ready. Click below to enter the room."
                : `This meeting starts at ${scheduledDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}. You can join 15 minutes before.`}
            </p>
          </div>

          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span><strong>Position:</strong> {jobTitle}</span>
            </div>
            {isHR && (
              <div className="flex items-center gap-2">
                <span>👤</span>
                <span><strong>Candidate:</strong> {candidateName}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span>👤</span>
              <span><strong>Joining as:</strong> {userName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>⏱️</span>
              <span><strong>Duration:</strong> {interview.duration_minutes} minutes</span>
            </div>
          </div>

          <button
            onClick={() => setActiveRoom({ name: roomName, user: userName })}
            disabled={!canJoin}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canJoin ? "Join Meeting" : `Opens in ${minutesUntil}m`}
          </button>

          {isHR && interview.status !== "completed" && (
            <button
              onClick={markCompleted}
              className="w-full rounded-xl border border-border py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
            >
              Mark as Completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}