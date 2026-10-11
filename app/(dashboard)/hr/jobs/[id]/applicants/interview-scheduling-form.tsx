"use client";

import { useEffect, useState } from "react";
import { getOfficeBranches, scheduleInterviewProposal } from "./actions";
import { getNextAvailableInterviewSlot } from "@/app/actions/interviews";
import { checkPhtWorkHoursWarning, utcToPhtInputString } from "@/lib/interview-date";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";
import type { InterviewType, MeetingType } from "@/lib/types";
import { CalendarDays, Check, Clock3, MapPin, Video } from "lucide-react";

interface InterviewSchedulingFormProps {
  applicationId: string;
  jobId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function InterviewSchedulingForm({
  applicationId,
  jobId,
  onSuccess,
  onCancel,
}: InterviewSchedulingFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_DURATION_MINUTES);
  const [hint, setHint] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);
  const [offeredModes, setOfferedModes] = useState<InterviewType[]>(["online", "in_person"]);
  const [locationDetails, setLocationDetails] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>("hybrid");
  const [branches, setBranches] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
  const [officeBranchId, setOfficeBranchId] = useState("");
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  useEffect(() => {
    void getOfficeBranches().then((result) => {
      const data = result.success ? (result.data ?? []) : [];
      setBranches(data);
      setBranchesLoaded(true);
      if (data.length === 0) {
        setOfferedModes(["online"]);
        setMeetingType("online");
        setOfficeBranchId("");
      } else if (data.length === 1) {
        setOfficeBranchId(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    void getNextAvailableInterviewSlot({
      applicationId,
      durationMinutes,
    }).then((res) => {
      if (isMounted && !isTouched) {
        setScheduledAt(utcToPhtInputString(res.start_time));
        if (res.movedReason) {
          setHint(res.movedReason);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [applicationId, isTouched, durationMinutes]);

  const allowsInPerson = offeredModes.includes("in_person");

  const toggleMode = (mode: InterviewType) => {
    setOfferedModes((prev) => {
      if (prev.includes(mode)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== mode);
      }
      return [...prev, mode];
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if ((meetingType === "in_person" || meetingType === "hybrid") && !officeBranchId) {
      setError("Office branch is required for an in-person or hybrid interview");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData(e.currentTarget);
      formData.append("job_id", jobId);
      formData.append("application_id", applicationId);
      offeredModes.forEach((mode) => formData.append("available_modes", mode));
      formData.set("meeting_type", meetingType);
      formData.set("office_branch_id", meetingType === "in_person" || meetingType === "hybrid" ? officeBranchId : "");
      formData.append("location_details", allowsInPerson ? locationDetails.trim() : "");

      const response = await scheduleInterviewProposal(formData);

      if (response.success) {
        onSuccess?.();
      } else {
        setError(response.error || "Failed to schedule interview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-8">
      {error && (
        <div className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="w-full">
          <label htmlFor="scheduled_at" className="mb-2 block w-full text-sm font-medium text-text-primary">
            Date & Time (PHT, UTC+8)
          </label>
          <input
            type="datetime-local"
            id="scheduled_at"
            name="scheduled_at"
            value={scheduledAt}
            onChange={(e) => {
              setIsTouched(true);
              setScheduledAt(e.target.value);
              setHint(null);
            }}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
          />
          {hint && (
            <p className="mt-1 text-xs text-amber-600 font-medium">
              {hint}
            </p>
          )}
          {checkPhtWorkHoursWarning(scheduledAt, durationMinutes) && (
            <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded p-1.5 border border-amber-200">
              {checkPhtWorkHoursWarning(scheduledAt, durationMinutes)}
            </p>
          )}
        </div>

        <div className="w-full">
          <label htmlFor="duration_minutes" className="mb-2 block w-full text-sm font-medium text-text-primary">
            Duration
          </label>
          <select
            id="duration_minutes"
            name="duration_minutes"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
          >
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
            <option value={120}>120 minutes</option>
          </select>
        </div>
      </div>

      <div className="w-full">
        <label className="mb-3 block w-full text-sm font-medium text-text-primary">
          Interview Availability
        </label>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setOfferedModes(["online"]); setMeetingType("online"); }}
            className={`relative rounded-2xl border p-4 text-left transition-all ${
              meetingType === "online"
                ? "border-success bg-success-bg ring-2 ring-success/20"
                : "border-border hover:bg-surface-container-low"
            }`}
          >
            <Video className="mb-3 h-5 w-5 text-primary" />
            {meetingType === "online" && <Check className="absolute right-4 top-4 h-4 w-4 text-green-700" />}
            <p className="w-full text-sm font-semibold text-text-primary">Online</p>
            <p className="w-full text-xs text-text-secondary">WebRTC video interview</p>
          </button>
          <button
            type="button"
            disabled={branchesLoaded && branches.length === 0}
            onClick={() => { setOfferedModes(["online", "in_person"]); setMeetingType("hybrid"); }}
            className={`relative rounded-2xl border p-4 text-left transition-all ${
              branchesLoaded && branches.length === 0
                ? "opacity-50 cursor-not-allowed bg-gray-100 border-border"
                : meetingType === "hybrid"
                ? "border-success bg-success-bg ring-2 ring-success/20"
                : "border-border hover:bg-surface-container-low"
            }`}
          >
            <p className="w-full text-sm font-semibold text-text-primary">Both</p>
            <p className="w-full text-xs text-text-secondary">Video room and office option</p>
          </button>
          <button
            type="button"
            disabled={branchesLoaded && branches.length === 0}
            onClick={() => { setOfferedModes(["in_person"]); setMeetingType("in_person"); }}
            className={`relative rounded-2xl border p-4 text-left transition-all ${
              branchesLoaded && branches.length === 0
                ? "opacity-50 cursor-not-allowed bg-gray-100 border-border"
                : meetingType === "in_person"
                ? "border-success bg-success-bg ring-2 ring-success/20"
                : "border-border hover:bg-surface-container-low"
            }`}
          >
            <MapPin className="mb-3 h-5 w-5 text-primary" />
            {meetingType === "in_person" && <Check className="absolute right-4 top-4 h-4 w-4 text-green-700" />}
            <p className="w-full text-sm font-semibold text-text-primary">In-Person</p>
            <p className="w-full text-xs text-text-secondary">Office/location details required</p>
          </button>
        </div>
        {branchesLoaded && branches.length === 0 && (
          <p className="mt-2 w-full text-xs text-amber-600">
            No office branches configured. Only Online mode is available.
          </p>
        )}
        <p className="mt-2 w-full text-xs text-text-secondary">
          Select one or both options. Applicants will only see the settings enabled here.
        </p>
      </div>

      {(meetingType === "in_person" || meetingType === "hybrid") && (
        <div className="w-full">
          <label htmlFor="office_branch_id" className="block w-full text-sm font-medium text-text-primary mb-2">
            Office Branch
          </label>
          <select
            id="office_branch_id"
            value={officeBranchId}
            onChange={(e) => setOfficeBranchId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select office branch</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} — {branch.address}</option>)}
          </select>
        </div>
      )}

      {offeredModes.includes("online") && (
        <div className="w-full rounded-2xl bg-primary-light p-4 text-sm text-primary">
          Online interviews include an auto-generated meeting room.
        </div>
      )}

      <div className="w-full">
        <label htmlFor="notes" className="block w-full text-sm font-medium text-text-primary mb-2">
          Additional Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="e.g., Meeting link, office location, topics to discuss..."
            className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </div>

      <div className="w-full">
        <label htmlFor="timezone" className="block w-full text-sm font-medium text-text-primary mb-2">
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="Asia/Manila"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
        >
          <option value="UTC">UTC</option>
          <option value="America/New_York">Eastern Time (US)</option>
          <option value="America/Chicago">Central Time (US)</option>
          <option value="America/Denver">Mountain Time (US)</option>
          <option value="America/Los_Angeles">Pacific Time (US)</option>
          <option value="Europe/London">London (GMT)</option>
          <option value="Europe/Paris">Paris (CET)</option>
          <option value="Asia/Singapore">Singapore (SGT)</option>
          <option value="Asia/Bangkok">Bangkok (ICT)</option>
          <option value="Asia/Manila">Manila (PHT)</option>
          <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
          <option value="Asia/Tokyo">Tokyo (JST)</option>
          <option value="Asia/Shanghai">Shanghai (CST)</option>
          <option value="Asia/Kolkata">India (IST)</option>
          <option value="Australia/Sydney">Sydney (AEDT)</option>
        </select>
      </div>

      <div className="flex w-full flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-xl border border-border px-5 py-3 font-medium text-text-primary transition hover:bg-surface-container-low sm:w-auto"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? "Sending..." : "Send Schedule Proposal"}
        </button>
      </div>
    </form>
  );
}