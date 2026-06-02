"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateOfferDraft, sendDraftOffer } from "@/app/(auth)/actions/offer-actions";

export default function OfferReviewModal({
  isOpen,
  onClose,
  jobId,
  applicationId,
  offer,
  onSent,
}: {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  applicationId: string;
  offer: any;
  onSent?: (offerId: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [local, setLocal] = useState(() => ({
    salary: offer?.salary ?? 0,
    start_date: offer?.start_date ?? null,
    work_setup: offer?.work_setup ?? "Remote",
    department: offer?.department ?? "",
    probation_days: offer?.probation_days ?? 180,
    benefits: (offer?.job_metadata?.benefits ?? [])?.join ? (offer.job_metadata.benefits.join(", ")) : (offer?.job_metadata?.benefits ?? ""),
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isOpen || !isMounted) return null;

  const saveDraft = async () => {
    try {
      const updates: Record<string, any> = {
        salary: Number(local.salary) || 0,
        start_date: local.start_date || null,
        work_setup: local.work_setup,
        department: local.department || null,
        probation_days: Number(local.probation_days) || 0,
        job_metadata: {
          ...(offer.job_metadata || {}),
          benefits: typeof local.benefits === "string" ? local.benefits.split(",").map((s) => s.trim()) : local.benefits,
        },
      };

      const result = await updateOfferDraft(offer.id, updates);
      if (!result?.success) {
        toast.error(result?.error || "Failed to save draft");
        return;
      }
      toast.success("Draft saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    }
  };

  const sendOffer = async () => {
    try {
      setSending(true);
      setSendError(null);
      setSendSuccess(false);

      toast.info("Sending offer to DocuSeal...");
      const result = await sendDraftOffer(jobId, applicationId, offer.id);
      if (!result?.success) {
        const message = (result as any)?.error || "Failed to send offer";
        setSendError(message);
        toast.error(message);
        return;
      }
      setSendSuccess(true);
      toast.success("Offer sent");
      onSent?.(offer.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send offer";
      setSendError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="z-10 w-full max-w-2xl rounded-2xl border border-orange-100 bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-orange-100 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Offer Preview & Edit</h3>
            <p className="mt-1 text-sm text-gray-600">Create the draft, then send it to DocuSeal.</p>
          </div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            Send surface
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-1">
            <div className="text-xs text-gray-600">Salary</div>
            <input className="w-full rounded border px-2 py-1" value={local.salary} onChange={(e) => setLocal({ ...local, salary: e.target.value })} />
          </label>
          <label className="col-span-1">
            <div className="text-xs text-gray-600">Start date</div>
            <input type="date" className="w-full rounded border px-2 py-1" value={local.start_date ?? ""} onChange={(e) => setLocal({ ...local, start_date: e.target.value || null })} />
          </label>

          <label className="col-span-1">
            <div className="text-xs text-gray-600">Work setup</div>
            <input className="w-full rounded border px-2 py-1" value={local.work_setup} onChange={(e) => setLocal({ ...local, work_setup: e.target.value })} />
          </label>
          <label className="col-span-1">
            <div className="text-xs text-gray-600">Department</div>
            <input className="w-full rounded border px-2 py-1" value={local.department} onChange={(e) => setLocal({ ...local, department: e.target.value })} />
          </label>

          <label className="col-span-1">
            <div className="text-xs text-gray-600">Probation days</div>
            <input type="number" className="w-full rounded border px-2 py-1" value={local.probation_days} onChange={(e) => setLocal({ ...local, probation_days: e.target.value })} />
          </label>
          <label className="col-span-1">
            <div className="text-xs text-gray-600">Benefits (comma separated)</div>
            <input className="w-full rounded border px-2 py-1" value={local.benefits} onChange={(e) => setLocal({ ...local, benefits: e.target.value })} />
          </label>
        </div>

        {sendError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
            {sendError}
          </div>
        )}

        {sendSuccess && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            Offer sent successfully. The job offer status should update after refresh.
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" onClick={onClose}>Cancel</button>
          <button className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100" onClick={saveDraft}>Save Draft</button>
          <button className="rounded-lg bg-gradient-to-r from-primary to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60" onClick={sendOffer} disabled={sending || sendSuccess}>
            {sending ? "Sending.." : sendSuccess ? "Sent" : sendError ? "Retry Send" : "Send Offer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
