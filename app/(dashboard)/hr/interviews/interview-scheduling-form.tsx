"use client";

import { useEffect, useState } from "react";
import { getOfficeBranches, scheduleInterviewProposal } from "./actions";
import { getNextAvailableInterviewSlot } from "@/app/actions/interviews";
import { checkPhtWorkHoursWarning, utcToPhtInputString } from "@/lib/interview-date";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";
import type { InterviewType, MeetingType } from "@/lib/types";
import type { OfficeBranchOption } from "./actions";

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
  const [meetingType, setMeetingType] = useState<MeetingType>("hybrid");
  const [branches, setBranches] = useState<OfficeBranchOption[]>([]);
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="scheduled_at" className="block text-sm font-medium text-text-primary mb-1">
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
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

      <div>
        <label htmlFor="duration_minutes" className="block text-sm font-medium text-text-primary mb-2">
          Duration
        </label>
        <select
          id="duration_minutes"
          name="duration_minutes"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
          <option value={120}>120 minutes</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-3">
          Interview Availability
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setOfferedModes(["online"]); setMeetingType("online"); }}
            className={`rounded-lg border p-3 text-left transition-colors ${
              meetingType === "online"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-text-primary">Online</p>
            <p className="text-xs text-text-secondary">Candidate can choose video interview</p>
          </button>
          <button
            type="button"
            disabled={branchesLoaded && branches.length === 0}
            onClick={() => { setOfferedModes(["online", "in_person"]); setMeetingType("hybrid"); }}
            className={`rounded-lg border p-3 text-left transition-colors ${
              branchesLoaded && branches.length === 0
                ? "opacity-50 cursor-not-allowed bg-gray-100 border-border"
                : meetingType === "hybrid"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-text-primary">Both</p>
            <p className="text-xs text-text-secondary">Video room and office option</p>
          </button>
          <button
            type="button"
            disabled={branchesLoaded && branches.length === 0}
            onClick={() => { setOfferedModes(["in_person"]); setMeetingType("in_person"); }}
            className={`rounded-lg border p-3 text-left transition-colors ${
              branchesLoaded && branches.length === 0
                ? "opacity-50 cursor-not-allowed bg-gray-100 border-border"
                : meetingType === "in_person"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-text-primary">In-Person</p>
            <p className="text-xs text-text-secondary">Office/location details required</p>
          </button>
        </div>
        {branchesLoaded && branches.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            No office branches configured. Only Online mode is available.
          </p>
        )}
        <p className="mt-2 text-xs text-text-secondary">
          Select one or both options. Applicants will only see the settings enabled here.
        </p>
      </div>

      {(meetingType === "in_person" || meetingType === "hybrid") && (
        <div>
          <label htmlFor="office_branch_id" className="block text-sm font-medium text-text-primary mb-2">
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
        <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
          Online interviews include an auto-generated meeting room.
        </div>
      )}

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-text-primary mb-2">
          Additional Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="e.g., Meeting link, office location, topics to discuss..."
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-text-primary mb-2">
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="Asia/Manila"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
        >
          {loading ? "Scheduling..." : "Schedule Interview"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-border text-text-primary rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}