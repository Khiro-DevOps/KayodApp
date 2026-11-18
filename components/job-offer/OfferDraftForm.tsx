"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createHydratedOfferDraft,
  updateOfferDraft,
  sendDraftOffer,
} from "@/app/(auth)/actions/offer-actions";

export interface OfficeBranchItem {
  id: string;
  name: string;
  address?: string | null;
}

export interface OfferDraftRecord {
  id: string;
  application_id: string;
  job_id?: string | null;
  status: string;
  salary?: number | string | null;
  start_date?: string | null;
  work_setup?: string | null;
  work_mode?: string | null;
  work_location_id?: string | null;
  department?: string | null;
  probation_days?: number | string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  work_days?: string[] | null;
  job_metadata?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface OfferDraftFormProps {
  applicationId: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
  initialOffer: OfferDraftRecord | null;
  branches?: OfficeBranchItem[];
  onClose?: () => void;
  onSent?: (offerId: string) => void;
}

const STANDARD_WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatBenefitsValue(offer: OfferDraftRecord | null): string {
  const meta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.benefits;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  if (typeof raw === "string") {
    return raw;
  }
  return "";
}

export default function OfferDraftForm({
  applicationId,
  jobId,
  candidateName,
  jobTitle,
  initialOffer,
  branches = [],
  onClose,
  onSent,
}: OfferDraftFormProps) {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferDraftRecord | null>(initialOffer);
  const [startingDraft, setStartingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [salary, setSalary] = useState<string>(String(initialOffer?.salary ?? 0));
  const [startDate, setStartDate] = useState<string>(initialOffer?.start_date ?? "");
  const [workSetup, setWorkSetup] = useState<string>(
    initialOffer?.work_setup ?? initialOffer?.work_mode ?? "Remote"
  );
  const [workLocationId, setWorkLocationId] = useState<string>(
    initialOffer?.work_location_id ?? ""
  );
  const [department, setDepartment] = useState<string>(initialOffer?.department ?? "");
  const [probationDays, setProbationDays] = useState<string>(
    String(initialOffer?.probation_days ?? 180)
  );
  const [shiftStart, setShiftStart] = useState<string>(initialOffer?.shift_start ?? "");
  const [shiftEnd, setShiftEnd] = useState<string>(initialOffer?.shift_end ?? "");
  const [workDays, setWorkDays] = useState<string[]>(
    Array.isArray(initialOffer?.work_days) ? initialOffer.work_days : []
  );
  const [benefits, setBenefits] = useState<string>(formatBenefitsValue(initialOffer));

  const syncFormFromOffer = (nextOffer: OfferDraftRecord) => {
    setOffer(nextOffer);
    setSalary(String(nextOffer.salary ?? 0));
    setStartDate(nextOffer.start_date ?? "");
    setWorkSetup(nextOffer.work_setup ?? nextOffer.work_mode ?? "Remote");
    setWorkLocationId(nextOffer.work_location_id ?? "");
    setDepartment(nextOffer.department ?? "");
    setProbationDays(String(nextOffer.probation_days ?? 180));
    setShiftStart(nextOffer.shift_start ?? "");
    setShiftEnd(nextOffer.shift_end ?? "");
    setWorkDays(Array.isArray(nextOffer.work_days) ? nextOffer.work_days : []);
    setBenefits(formatBenefitsValue(nextOffer));
  };

  const handleStartDraft = async () => {
    try {
      setStartingDraft(true);
      setActionError(null);
      setActionSuccess(null);

      const result = await createHydratedOfferDraft(applicationId);
      if (!result?.success || !result.offer) {
        const message = result?.error || "Failed to create offer draft";
        setActionError(message);
        toast.error(message);
        return;
      }

      syncFormFromOffer(result.offer as OfferDraftRecord);
      toast.success("Offer draft created");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create offer draft";
      setActionError(message);
      toast.error(message);
    } finally {
      setStartingDraft(false);
    }
  };

  const buildUpdatesPayload = () => {
    const existingMeta = (offer?.job_metadata ?? offer?.metadata ?? {}) as Record<string, unknown>;
    const parsedBenefits = benefits
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      salary: Number(salary) || 0,
      start_date: startDate || null,
      work_setup: workSetup || "Remote",
      work_mode: (workSetup || "remote").toLowerCase(),
      work_location_id: workLocationId || null,
      department: department.trim() || null,
      probation_days: Number(probationDays) || 0,
      shift_start: shiftStart || null,
      shift_end: shiftEnd || null,
      work_days: workDays.length > 0 ? workDays : null,
      job_metadata: {
        ...existingMeta,
        start_date: startDate || null,
        benefits: parsedBenefits,
      },
    };
  };

  const handleSaveDraft = async () => {
    if (!offer) return;
    try {
      setSaving(true);
      setActionError(null);
      setActionSuccess(null);

      const updates = buildUpdatesPayload();
      const result = await updateOfferDraft(offer.id, updates);
      if (!result?.success) {
        const message = result?.error || "Failed to save draft";
        setActionError(message);
        toast.error(message);
        return;
      }

      if (result.offer) {
        syncFormFromOffer(result.offer as OfferDraftRecord);
      }
      setActionSuccess("Draft saved.");
      toast.success("Draft saved");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendOffer = async () => {
    if (!offer) return;
    try {
      setSending(true);
      setActionError(null);
      setActionSuccess(null);

      const updates = buildUpdatesPayload();
      const saveRes = await updateOfferDraft(offer.id, updates);
      if (!saveRes?.success) {
        const message = saveRes?.error || "Failed to save offer terms before sending";
        setActionError(message);
        toast.error(message);
        return;
      }

      const resolvedJobId = String(offer.job_id || jobId).trim();
      const result = await sendDraftOffer(resolvedJobId, applicationId, offer.id);
      if (!result?.success) {
        const message = result?.error || "Failed to send offer";
        setActionError(message);
        toast.error(message);
        return;
      }

      setActionSuccess("Offer sent.");
      toast.success("Offer sent");
      onSent?.(offer.id);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send offer";
      setActionError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    );
  };

  if (!offer) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Job Offer Preparation
          </p>
          <h1 className="mt-1 text-xl font-bold text-text-primary">{candidateName}</h1>
          <p className="text-sm text-text-secondary">{jobTitle}</p>
        </div>

        <p className="text-sm text-text-secondary">
          No offer draft exists for this application yet. Start a draft to review and customize the offer terms before sending.
        </p>

        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
            {actionError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleStartDraft}
            disabled={startingDraft}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {startingDraft ? "Starting draft..." : "Start offer draft"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{candidateName}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{jobTitle}</p>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Draft
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Salary</span>
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Start date</span>
          <input
            type="date"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Work setup</span>
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={workSetup}
            onChange={(e) => setWorkSetup(e.target.value)}
          >
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Branch</span>
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
          >
            <option value="">None / Default location</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.address ? ` — ${b.address}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Department</span>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Probation days</span>
          <input
            type="number"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={probationDays}
            onChange={(e) => setProbationDays(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Shift start</span>
          <input
            type="time"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={shiftStart}
            onChange={(e) => setShiftStart(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-text-secondary">Shift end</span>
          <input
            type="time"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={shiftEnd}
            onChange={(e) => setShiftEnd(e.target.value)}
          />
        </label>

        <div className="space-y-1 sm:col-span-2">
          <span className="block text-xs font-medium text-text-secondary">Work days</span>
          <div className="flex flex-wrap gap-2">
            {STANDARD_WORK_DAYS.map((day) => {
              const selected = workDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWorkDay(day)}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-text-secondary hover:bg-surface"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-text-secondary">
            Benefits (comma separated)
          </span>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </label>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700">
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
          {actionSuccess}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving || sending}
          className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save draft"}
        </button>
        <button
          type="button"
          onClick={handleSendOffer}
          disabled={saving || sending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send offer"}
        </button>
      </div>
    </div>
  );
}
