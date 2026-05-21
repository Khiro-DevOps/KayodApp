"use client";

import { useState } from "react";
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
  const [local, setLocal] = useState(() => ({
    salary: offer?.salary ?? 0,
    start_date: offer?.start_date ?? null,
    work_setup: offer?.work_setup ?? "Remote",
    department: offer?.department ?? "",
    probation_days: offer?.probation_days ?? 180,
    benefits: (offer?.job_metadata?.benefits ?? [])?.join ? (offer.job_metadata.benefits.join(", ")) : (offer?.job_metadata?.benefits ?? ""),
  }));

  if (!isOpen) return null;

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
      toast.info("Sending offer to DocuSeal...");
      const result = await sendDraftOffer(jobId, applicationId, offer.id);
      if (!result?.success) {
        toast.error((result as any)?.error || "Failed to send offer");
        return;
      }
      toast.success("Offer sent");
      onSent?.(offer.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send offer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="z-10 w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">Offer Preview & Edit</h3>

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

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-1" onClick={onClose}>Cancel</button>
          <button className="rounded border bg-gray-100 px-3 py-1" onClick={saveDraft}>Save Draft</button>
          <button className="rounded bg-primary px-3 py-1 text-white" onClick={sendOffer}>Send Offer</button>
        </div>
      </div>
    </div>
  );
}
