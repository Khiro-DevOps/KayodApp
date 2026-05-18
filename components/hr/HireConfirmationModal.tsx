"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface HireConfirmationModalProps {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  isConfirmed: boolean;
}

export default function HireConfirmationModal({
  applicationId,
  candidateName,
  jobTitle,
  isConfirmed,
}: HireConfirmationModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmHire() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/hr/confirm-hire/${applicationId}`, {
        method: "POST",
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to confirm hire");
      }

      setOpen(false);
      router.refresh();
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : "Failed to confirm hire");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isConfirmed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        Hire confirmed for {candidateName} on {jobTitle}.
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
      >
        Confirm hire
      </button>

      {open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary">Confirm hire</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Confirm {candidateName} for {jobTitle}? This will move the applicant into employee status.
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmHire()}
                disabled={isSubmitting}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Confirming..." : "Confirm hire"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}