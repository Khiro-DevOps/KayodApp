"use client";

import { useState } from "react";
import { scheduleInterviewProposal } from "./actions";

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
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["online", "in_person"]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      formData.append("job_id", jobId);
      formData.append("application_id", applicationId);
      formData.append("interview_types", JSON.stringify(selectedTypes));

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
          Proposed Date & Time
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

      {/* Interview Type Selection */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-3">
          Interview Type Options (candidate will choose)
        </label>
        <div className="space-y-2">
          {[
            { value: "online", label: "Online (Video Call)", icon: "📹" },
            { value: "in_person", label: "In-Person (Office)", icon: "🏢" },
          ].map((type) => (
            <label
              key={type.value}
              className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedTypes.includes(type.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTypes([...selectedTypes, type.value]);
                  } else {
                    setSelectedTypes(selectedTypes.filter((t) => t !== type.value));
                  }
                }}
                className="w-4 h-4 text-primary cursor-pointer"
              />
              <span className="text-lg">{type.icon}</span>
              <span className="text-sm font-medium text-text-primary">{type.label}</span>
            </label>
          ))}
        </div>
        {selectedTypes.length === 0 && (
          <p className="mt-2 text-xs text-red-600">Select at least one interview type</p>
        )}
      </div>

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
          disabled={loading || selectedTypes.length === 0}
          className="flex-1 bg-primary text-white py-2 rounded-lg font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
        >
          {loading ? "Scheduling..." : "Send Proposal to Candidate"}
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
