"use client";

import { useRouter } from "next/navigation";
import { APPLICATION_STATUS_COLORS } from "@/lib/types";
import { updateApplicationStatus, moveToApplied } from "./hr-applications-actions";

interface HRApplicantCardProps {
  app: any;
  candidate: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  resume: { title: string } | null;
  fullName: string;
}

export default function HRApplicantCard({ app, candidate, resume, fullName }: HRApplicantCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    router.push(`/hr/applicants/${app.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className="block cursor-pointer rounded-2xl bg-surface border border-border p-4 space-y-3 hover:border-primary hover:shadow-md transition-all"
    >
      {/* Candidate info */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{fullName}</p>
            <p className="text-xs text-text-secondary truncate">{candidate?.email}</p>
            {candidate?.phone && (
              <p className="text-xs text-text-tertiary">{candidate.phone}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${APPLICATION_STATUS_COLORS[app.status as keyof typeof APPLICATION_STATUS_COLORS]}`}>
          {app.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Resume + match score */}
      <div className="flex items-center gap-3 text-xs text-text-secondary">
        {resume && (
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-9Z" />
            </svg>
            {resume.title}
          </span>
        )}
        {app.match_score !== null && (
          <span className={`font-medium ${app.match_score >= 70 ? "text-green-600" : app.match_score >= 40 ? "text-amber-600" : "text-red-500"}`}>
            {Math.round(app.match_score)}% match
          </span>
        )}
        <span className="ml-auto">
          Applied {new Date(app.submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Cover letter */}
      {app.cover_letter && (
        <p className="text-xs text-text-secondary bg-gray-50 rounded-xl px-3 py-2 line-clamp-2">
          {app.cover_letter}
        </p>
      )}

      {/* Action buttons */}
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2">
          {/* Schedule interview button */}
          {["submitted", "under_review", "shortlisted"].includes(app.status) && (
            <button
              onClick={() => router.push(`/interviews/schedule?applicationId=${app.id}`)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.28.53l2.72-2.72 2.72 2.72a.75.75 0 0 0 1.28-.53V2.75a.75.75 0 0 0-.75-.75h-6.5Z" />
              </svg>
              Schedule
            </button>
          )}

          {/* Status update dropdown */}
          <form action={updateApplicationStatus} onClick={(e) => e.stopPropagation()}>
            <input type="hidden" name="application_id" value={app.id} />
            <select
              name="status"
              onChange={(e) => {
                e.stopPropagation();
                (e.target as HTMLSelectElement).form?.requestSubmit();
              }}
              defaultValue={app.status}
              className="w-full rounded-xl border border-border px-2 py-2 text-xs text-text-secondary bg-white outline-none focus:border-primary"
            >
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview_scheduled">Interview scheduled</option>
              <option value="interviewed">Interviewed</option>
              <option value="offer_sent">Offer sent</option>
              <option value="hired">Hired</option>
              <option value="rejected">Rejected</option>
            </select>
          </form>

          {/* Move to Applied button for rejected */}
          {app.status === "rejected" && (
            <form action={moveToApplied} onClick={(e) => e.stopPropagation()}>
              <input type="hidden" name="application_id" value={app.id} />
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M12.78 1.22a.75.75 0 0 1 0 1.06L2.28 12.78a.75.75 0 0 1-1.06-1.06L11.72 1.22a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
                Reconsider
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
