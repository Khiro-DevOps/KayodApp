"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Note {
  interview_score: number | null;
  strengths: string | null;
  concerns: string | null;
  culture_fit: string | null;
  recommendation: string | null;
  general_notes: string | null;
}

interface Interview {
  id: string;
  scheduled_at: string;
  interview_type: string;
  status: string;
}

interface Candidate {
  app: {
    id: string;
    status: string;
    match_score: number | null;
    submitted_at: string;
    profiles: { id: string; first_name: string; last_name: string; email: string } | null;
    resumes: { id: string; title: string } | null;
  };
  interview: Interview | null | undefined;
  note: Note | null | undefined;
}

const recommendationConfig: Record<string, { label: string; color: string }> = {
  strongly_recommend: { label: "⭐⭐⭐ Strongly Recommend", color: "text-green-700" },
  recommend:          { label: "⭐⭐ Recommend",           color: "text-green-600" },
  neutral:            { label: "⭐ Neutral",               color: "text-yellow-600" },
  do_not_recommend:   { label: "❌ Do Not Recommend",      color: "text-red-600"   },
};

export default function ReviewBoardClient({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"negotiate" | "reject" | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.app.id)));
    }
  };

  async function handleBulkAction(action: "negotiate" | "reject") {
    if (selected.size === 0) return;
    setActing(true);
    const supabase = createClient();

    const ids = Array.from(selected);
    const newStatus = action === "negotiate" ? "negotiating" : "rejected";

    await supabase
      .from("applications")
      .update({ status: newStatus })
      .in("id", ids);

    setSelected(new Set());
    setConfirmAction(null);
    setActing(false);
    router.refresh();
  }

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-text-secondary";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-500";
  };

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected.size === candidates.length && candidates.length > 0}
            onChange={toggleAll}
            className="rounded border-border"
          />
          {selected.size === 0
            ? "Select all"
            : `${selected.size} selected`}
        </label>

        {selected.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmAction("negotiate")}
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              📞 Move to Negotiation
            </button>
            <button
              onClick={() => setConfirmAction("reject")}
              className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
            >
              ❌ Reject Selected
            </button>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="rounded-2xl border border-border bg-gray-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">
            {confirmAction === "negotiate"
              ? `Move ${selected.size} candidate${selected.size !== 1 ? "s" : ""} to negotiation?`
              : `Reject ${selected.size} candidate${selected.size !== 1 ? "s" : ""}?`}
          </p>
          <p className="text-xs text-text-secondary">
            {confirmAction === "negotiate"
              ? "Their status will change to Negotiating. You can log call outcomes from their applicant detail page."
              : "This will mark them as rejected. They will no longer appear on the Review Board."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmAction(null)}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-text-secondary hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleBulkAction(confirmAction)}
              disabled={acting}
              className={`flex-1 rounded-xl py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                confirmAction === "negotiate"
                  ? "bg-primary hover:bg-primary/90"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {acting ? "Processing..." : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {/* Candidate cards */}
      {candidates.map(({ app, interview, note }) => {
        const name = app.profiles
          ? `${app.profiles.first_name} ${app.profiles.last_name}`
          : "Unknown";
        const isExpanded = expanded === app.id;
        const isSelected = selected.has(app.id);
        const rec = note?.recommendation
          ? recommendationConfig[note.recommendation]
          : null;

        return (
          <div
            key={app.id}
            className={`rounded-2xl border bg-surface transition-all ${
              isSelected ? "border-primary" : "border-border"
            }`}
          >
            {/* Card header */}
            <div className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(app.id)}
                className="mt-1 rounded border-border"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {name}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {app.profiles?.email}
                    </p>
                  </div>

                  {/* Scores */}
                  <div className="flex items-center gap-3 shrink-0">
                    {note?.interview_score !== null && note?.interview_score !== undefined && (
                      <div className="text-center">
                        <p className={`text-lg font-bold ${scoreColor(note.interview_score)}`}>
                          {note.interview_score}
                        </p>
                        <p className="text-[10px] text-text-secondary">Score</p>
                      </div>
                    )}
                    {app.match_score !== null && (
                      <div className="text-center">
                        <p className={`text-lg font-bold ${scoreColor(app.match_score)}`}>
                          {app.match_score}%
                        </p>
                        <p className="text-[10px] text-text-secondary">Match</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendation badge */}
                {rec && (
                  <p className={`text-xs font-medium mt-1 ${rec.color}`}>
                    {rec.label}
                  </p>
                )}

                {/* Interview date */}
                {interview && (
                  <p className="text-xs text-text-secondary mt-1">
                    Interviewed{" "}
                    {new Date(interview.scheduled_at).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Expand/collapse notes */}
            <div className="border-t border-border">
              <button
                onClick={() => setExpanded(isExpanded ? null : app.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-secondary hover:bg-gray-50 transition-colors"
              >
                <span>{isExpanded ? "Hide notes" : "View interview notes"}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                >
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {!note ? (
                    <p className="text-xs text-text-secondary italic">
                      No interview notes recorded for this candidate.
                    </p>
                  ) : (
                    <>
                      {note.strengths && (
                        <div>
                          <p className="text-xs font-medium text-text-secondary mb-0.5">Strengths</p>
                          <p className="text-xs text-text-primary bg-green-50 rounded-lg px-3 py-2">
                            {note.strengths}
                          </p>
                        </div>
                      )}
                      {note.concerns && (
                        <div>
                          <p className="text-xs font-medium text-text-secondary mb-0.5">Concerns</p>
                          <p className="text-xs text-text-primary bg-red-50 rounded-lg px-3 py-2">
                            {note.concerns}
                          </p>
                        </div>
                      )}
                      {note.culture_fit && (
                        <div>
                          <p className="text-xs font-medium text-text-secondary mb-0.5">Culture Fit</p>
                          <p className="text-xs text-text-primary bg-purple-50 rounded-lg px-3 py-2">
                            {note.culture_fit}
                          </p>
                        </div>
                      )}
                      {note.general_notes && (
                        <div>
                          <p className="text-xs font-medium text-text-secondary mb-0.5">General Notes</p>
                          <p className="text-xs text-text-primary bg-gray-50 rounded-lg px-3 py-2">
                            {note.general_notes}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Link to full applicant detail */}
                  <Link
                    href={`/jobs/manage/${jobId}/applicants/${app.id}`}
                    className="inline-block text-xs text-primary underline underline-offset-2 mt-1"
                  >
                    View full applicant profile →
                  </Link>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}