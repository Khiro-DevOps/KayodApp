"use client";

import { useState } from "react";
import { moveToInterview } from "./application-detail-actions";

interface InterviewSchedulerProps {
  applicationId: string;
  candidateName: string;
  onScheduled?: () => void;
}

export default function InterviewScheduler({
  applicationId,
  candidateName,
  onScheduled,
}: InterviewSchedulerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    interview_type: "online" as "online" | "in_person",
    scheduled_at: "",
    duration_minutes: "60",
    timezone: "Asia/Manila",
    location_address: "",
    location_notes: "",
    video_room_name: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const form = new FormData();
      form.append("application_id", applicationId);
      form.append("scheduled_at", formData.scheduled_at);
      form.append("interview_type", formData.interview_type);
      form.append("duration_minutes", formData.duration_minutes);
      form.append("timezone", formData.timezone);
      if (formData.location_address) {
        form.append("location_address", formData.location_address);
      }
      if (formData.location_notes) {
        form.append("location_notes", formData.location_notes);
      }
      if (formData.video_room_name) {
        form.append("video_room_name", formData.video_room_name);
      }

      await moveToInterview(form);
      onScheduled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule interview");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border sticky top-0 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Schedule Interview
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Set up an interview with {candidateName}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Interview Type */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Interview Type
            </label>
            <select
              name="interview_type"
              value={formData.interview_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="online">🎥 Online Interview (Video Call)</option>
              <option value="in_person">📍 In-Person Interview</option>
            </select>
          </div>

          {/* Date & Time */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Interview Date & Time
            </label>
            <input
              type="datetime-local"
              name="scheduled_at"
              value={formData.scheduled_at}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-text-secondary mt-2">
              Select when the interview should take place
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Duration (minutes)
            </label>
            <select
              name="duration_minutes"
              value={formData.duration_minutes}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Timezone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="Asia/Manila">Asia/Manila (PHT)</option>
              <option value="Asia/Bangkok">Asia/Bangkok (ICT)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Europe/Berlin">Europe/Berlin (CET)</option>
            </select>
          </div>

          {/* Conditional Fields */}
          {formData.interview_type === "in_person" && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Location Address
                </label>
                <textarea
                  name="location_address"
                  value={formData.location_address}
                  onChange={handleChange}
                  placeholder="e.g., 123 Main St, Conference Room A, Floor 3"
                  required={formData.interview_type === "in_person"}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Additional Notes
                </label>
                <textarea
                  name="location_notes"
                  value={formData.location_notes}
                  onChange={handleChange}
                  placeholder="e.g., parking instructions, building access, what to bring"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={3}
                />
              </div>
            </>
          )}

          {formData.interview_type === "online" && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Video Room Name
              </label>
              <input
                type="text"
                name="video_room_name"
                value={formData.video_room_name}
                onChange={handleChange}
                placeholder="e.g., interview-smith-2024"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-text-secondary mt-2">
                A unique name for the video call room. Will be used to generate the meeting link.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border pt-6 flex gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Scheduling..." : "Schedule Interview"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
