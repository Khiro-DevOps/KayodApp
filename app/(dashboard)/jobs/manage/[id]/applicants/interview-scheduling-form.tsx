"use client";

import { useState } from "react";
import { scheduleInterviewProposal } from "./actions";
import type { InterviewType } from "@/lib/types";

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
  const [offeredModes, setOfferedModes] = useState<InterviewType[]>(["online"]);
  const [locationDetails, setLocationDetails] = useState("");

  const allowsInPerson = offeredModes.includes("in_person");

  const toggleMode = (mode: InterviewType) => {
    setOfferedModes((prev) => {
      if (prev.includes(mode)) {
        // Keep at least one interview mode selected.
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

    if (allowsInPerson && !locationDetails.trim()) {
      setError("Interview address/location details are required when In-Person is enabled");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData(e.currentTarget);
      formData.append("job_id", jobId);
      formData.append("application_id", applicationId);
      offeredModes.forEach((mode) => formData.append("available_modes", mode));
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

  // Format date for input (default to 3 days from now)
  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(10, 0, 0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Proposed Date & Time */}
      <div>
        <label htmlFor="scheduled_at" className="block text-sm font-medium text-text-primary mb-2">
          Date & Time
        </label>
        <input
          type="datetime-local"
          id="scheduled_at"
          name="scheduled_at"
          defaultValue={defaultDate}
          required
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Applicant ID */}
      <div>
        <label htmlFor="application_id_display" className="block text-sm font-medium text-text-primary mb-2">
          Applicant ID
        </label>
        <input
          id="application_id_display"
          type="text"
          value={applicationId}
          readOnly
          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-gray-50 text-text-secondary"
        />
      </div>

      {/* Duration */}
      <div>
        <label htmlFor="duration_minutes" className="block text-sm font-medium text-text-primary mb-2">
          Duration
        </label>
        <select
          id="duration_minutes"
          name="duration_minutes"
          defaultValue="60"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">60 minutes</option>
          <option value="90">90 minutes</option>
          <option value="120">120 minutes</option>
        </select>
      </div>

      {/* Interview Availability */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-3">
          Interview Availability
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => toggleMode("online")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              offeredModes.includes("online")
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-text-primary">Online</p>
            <p className="text-xs text-text-secondary">Candidate can choose video interview</p>
          </button>
          <button
            type="button"
            onClick={() => toggleMode("in_person")}
            className={`rounded-lg border p-3 text-left transition-colors ${
              offeredModes.includes("in_person")
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-text-primary">In-Person</p>
            <p className="text-xs text-text-secondary">Office/location details required</p>
          </button>
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          Select one or both options. Applicants will only see the settings enabled here.
        </p>
      </div>

      {allowsInPerson && (
        <div>
          <label htmlFor="location_details" className="block text-sm font-medium text-text-primary mb-2">
            Interview Address / Location Details
          </label>
          <textarea
            id="location_details"
            name="location_details"
            value={locationDetails}
            onChange={(e) => setLocationDetails(e.target.value)}
            required={allowsInPerson}
            rows={3}
            placeholder="e.g. 3rd Floor, Acme Building, Makati City. Please check in with reception."
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}

      {offeredModes.includes("online") && (
        <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
          Online interviews include an auto-generated meeting room.
        </div>
      )}

      {/* Additional Notes */}
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

      {/* Timezone */}
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

      {/* Action Buttons */}
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
