"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Interview {
  id: string;
  interview_type: string;
  video_room_url: string | null;
  location_address: string | null;
  location_notes: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  applications: {
    job_postings: { title: string };
    profiles: { first_name: string; last_name: string };
  };
}

export default function InterviewRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("interviews")
        .select(`
          *,
          applications (
            job_postings ( title ),
            profiles ( first_name, last_name )
          )
        `)
        .eq("id", params.id)
        .single();

      if (error || !data) {
        setError("Interview not found.");
      } else {
        setInterview(data as Interview);
      }
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Loading interview...</p>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-red-600">{error ?? "Something went wrong."}</p>
        <Link href="/interviews" className="text-sm text-primary underline">
          Back to interviews
        </Link>
      </div>
    );
  }

  const app = interview.applications as unknown as {
    job_postings: { title: string };
    profiles: { first_name: string; last_name: string };
  };

  const jobTitle = app?.job_postings?.title ?? "Interview";
  const candidateName = app?.profiles
    ? `${app.profiles.first_name} ${app.profiles.last_name}`
    : "Candidate";
  const scheduledDate = new Date(interview.scheduled_at);

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div>
          <p className="text-sm font-medium text-white">{jobTitle}</p>
          <p className="text-xs text-gray-400">
            {candidateName} · {scheduledDate.toLocaleDateString("en-PH", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
            })} · {interview.duration_minutes} min
          </p>
        </div>
        <Link
          href="/interviews"
          className="rounded-xl bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Exit
        </Link>
      </div>

      {/* Video room or in-person info */}
      {interview.interview_type === "online" && interview.video_room_url ? (
        <iframe
          src={interview.video_room_url}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="flex-1 w-full border-0"
          style={{ minHeight: "calc(100vh - 60px)" }}
        />
      ) : interview.interview_type === "online" && !interview.video_room_url ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="rounded-full bg-yellow-900/30 p-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-yellow-400">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium">Video room not available</p>
            <p className="text-gray-400 text-sm mt-1">
              The video room link was not generated. Please contact HR.
            </p>
          </div>
          <Link href="/interviews" className="rounded-xl bg-primary px-4 py-2 text-sm text-white">
            Back to interviews
          </Link>
        </div>
      ) : (
        // In-person
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="rounded-full bg-amber-900/30 p-5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-amber-400">
              <path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.083 3.203-4.697 3.203-7.627C19.5 6.105 16.332 3 12 3S4.5 6.105 4.5 10.5c0 2.93 1.259 5.544 3.203 7.627a19.58 19.58 0 0 0 2.683 2.282 16.975 16.975 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-white text-lg font-semibold">In-person Interview</p>
            <p className="text-gray-400 text-sm mt-1">
              {scheduledDate.toLocaleDateString("en-PH", {
                weekday: "long", month: "long", day: "numeric", year: "numeric"
              })}
            </p>
            <p className="text-gray-400 text-sm">
              {scheduledDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
              {" · "}{interview.duration_minutes} minutes
            </p>
          </div>
          {interview.location_address && (
            <div className="rounded-2xl bg-gray-800 px-5 py-4 text-left w-full max-w-sm">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Location</p>
              <p className="text-white text-sm">{interview.location_address}</p>
              {interview.location_notes && (
                <p className="text-gray-400 text-xs mt-2">{interview.location_notes}</p>
              )}
            </div>
          )}
          <Link href="/interviews" className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-300">
            Back to interviews
          </Link>
        </div>
      )}
    </div>
  );
}
