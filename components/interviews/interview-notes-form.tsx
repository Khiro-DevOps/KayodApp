"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveInterviewNotes } from "@/app/(dashboard)/interviews/notes-actions";

interface InterviewNotesFormProps {
  interviewId: string;
  initialNotes: string;
  candidateName: string;
}

export default function InterviewNotesForm({
  interviewId,
  initialNotes,
  candidateName,
}: InterviewNotesFormProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      const result = await saveInterviewNotes(interviewId, notes);
      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          router.push("/interviews");
        }, 2000);
      } else {
        setError(result.error || "Failed to save notes");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Success Message */}
      {isSuccess && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-success">
          ✓ Interview completed and notes saved successfully. Redirecting...
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
          ✕ {error}
        </div>
      )}

      {/* Notes Textarea */}
      <div className="space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium text-text-primary">
          Interview Notes
        </label>
        <p className="text-xs text-text-secondary">
          💡 Supports Markdown: **bold**, *italic*, - bullets, 1. numbered
        </p>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={`Add detailed notes about ${candidateName}'s interview...

## Evaluation Areas:
- **Technical Skills:**
- **Communication:**
- **Problem-Solving:**
- **Cultural Fit:**
- **Overall Assessment:**
- **Follow-up Items:**
- **Recommendation:**`}
          className="w-full h-96 rounded-xl border border-border bg-white p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-text-secondary">
          {notes.length} characters • {notes.split("\n").length} lines
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push("/interviews")}
          disabled={isLoading}
          className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Saving..." : "Complete Interview & Save Notes"}
        </button>
      </div>
    </form>
  );
}
