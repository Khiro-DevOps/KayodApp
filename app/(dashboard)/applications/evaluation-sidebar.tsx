"use client";

import { useState } from "react";
import type { Application, JobPosting } from "@/lib/types";
import { configureInterviewAvailability, updateApplicationEvaluation } from "./application-detail-actions";

interface EvaluationSidebarProps {
  application: Application;
  job: JobPosting;
  onStatusUpdate: () => void;
}

export default function EvaluationSidebar({
  application,
  job,
  onStatusUpdate,
}: EvaluationSidebarProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hrNotes, setHrNotes] = useState(application?.hr_notes || "");
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [supportsOnline, setSupportsOnline] = useState(
    application?.hr_offered_modes?.includes("online") ?? true
  );
  const [supportsInPerson, setSupportsInPerson] = useState(
    application?.hr_offered_modes?.includes("in_person") ?? false
  );
  const [officeAddress, setOfficeAddress] = useState(application?.hr_office_address || "");

  const statusConfig: Record<
    string,
    {
      label: string;
      color: string;
      bgColor: string;
      nextActions: Array<{ label: string; status: string; color: string }>;
    }
  > = {
    submitted: {
      label: "Under Review",
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      nextActions: [
        { label: "Shortlist", status: "shortlisted", color: "bg-yellow-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    under_review: {
      label: "Under Review",
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      nextActions: [
        { label: "Shortlist", status: "shortlisted", color: "bg-yellow-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    shortlisted: {
      label: "Shortlisted",
      color: "text-yellow-700",
      bgColor: "bg-yellow-50",
      nextActions: [
        { label: "Schedule Interview", status: "interview_scheduled", color: "bg-purple-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    interview_scheduled: {
      label: "Interview Scheduled",
      color: "text-purple-700",
      bgColor: "bg-purple-50",
      nextActions: [
        { label: "Mark as Interviewed", status: "interviewed", color: "bg-purple-600" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    interviewed: {
      label: "Interviewed",
      color: "text-purple-700",
      bgColor: "bg-purple-50",
      nextActions: [
        { label: "Send Offer", status: "offer_sent", color: "bg-green-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    offer_sent: {
      label: "Offer Sent",
      color: "text-green-700",
      bgColor: "bg-green-50",
      nextActions: [
        { label: "Mark as Hired", status: "hired", color: "bg-green-600" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    hired: {
      label: "Hired",
      color: "text-green-700",
      bgColor: "bg-green-50",
      nextActions: [],
    },
    rejected: {
      label: "Rejected",
      color: "text-red-700",
      bgColor: "bg-red-50",
      nextActions: [],
    },
  };

  const config = statusConfig[application?.status] || statusConfig.submitted;
  const nextActions = config.nextActions;

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application?.id);
      formData.append("status", newStatus);
      formData.append("hr_notes", hrNotes);

      await updateApplicationEvaluation(formData);
      onStatusUpdate();
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvailabilitySave = async () => {
    setAvailabilityError(null);

    if (!supportsOnline && !supportsInPerson) {
      setAvailabilityError("Select at least one interview mode.");
      return;
    }

    if (supportsInPerson && !officeAddress.trim()) {
      setAvailabilityError("Office address is required when in-person interviews are enabled.");
      return;
    }

    setIsSavingAvailability(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application.id);
      if (supportsOnline) {
        formData.append("hr_offered_modes", "online");
      }
      if (supportsInPerson) {
        formData.append("hr_offered_modes", "in_person");
      }
      formData.append("hr_office_address", officeAddress.trim());

      await configureInterviewAvailability(formData);
      onStatusUpdate();
    } catch (error) {
      setAvailabilityError(
        error instanceof Error ? error.message : "Failed to save interview availability"
      );
    } finally {
      setIsSavingAvailability(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <div className={`rounded-2xl border border-border ${config.bgColor} p-6`}>
        <p className="text-xs font-medium uppercase text-text-secondary mb-2">Current Status</p>
        <p className={`text-lg font-bold ${config.color} capitalize`}>{config.label}</p>
        <p className="text-xs text-text-secondary mt-3">
          Last updated {new Date(application?.updated_at).toLocaleDateString()}
        </p>
      </div>

      {/* Match Score & Job Info */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-2">Match Score</p>
          <div className="flex items-center gap-3">
            {application?.match_score !== null && (
              <>
                <div className="text-2xl font-bold text-text-primary">
                  {application?.match_score}%
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      application.match_score >= 70
                        ? "bg-green-500"
                        : application.match_score >= 40
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${application.match_score}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium uppercase text-text-secondary mb-2">Job Information</p>
          <div className="space-y-2 text-sm">
            <p className="text-text-primary font-medium">{job?.title}</p>
            {job?.location && (
              <p className="text-text-secondary">📍 {job.location}</p>
            )}
            {job?.salary_min && job?.salary_max && (
              <p className="text-text-secondary">
                💰 {job.salary_min.toLocaleString()} - {job.salary_max.toLocaleString()} {job.currency}
              </p>
            )}
            <p className="text-text-secondary capitalize">
              📋 {job?.employment_type?.replace("_", " ")}
            </p>
          </div>
        </div>
      </div>

      {/* HR Notes */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <label className="text-xs font-medium uppercase text-text-secondary block mb-2">
          HR Notes
        </label>
        <textarea
          value={hrNotes}
          onChange={(e) => setHrNotes(e.target.value)}
          placeholder="Add internal notes about this candidate..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          rows={4}
        />
        <button
          onClick={async () => {
            setIsLoading(true);
            try {
              const formData = new FormData();
              formData.append("application_id", application?.id);
              formData.append("hr_notes", hrNotes);
              await updateApplicationEvaluation(formData);
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
          className="mt-3 w-full px-4 py-2 text-sm font-medium bg-gray-100 text-text-secondary rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Save Notes
        </button>
      </div>

      {/* Interview Preferences */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-1">
            Interview Preferences
          </p>
          <p className="text-xs text-text-secondary">
            Configure available interview formats for this candidate. They will make the final selection.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSupportsOnline((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              supportsOnline
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-white text-text-secondary"
            }`}
          >
            Online
          </button>
          <button
            type="button"
            onClick={() => setSupportsInPerson((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              supportsInPerson
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-white text-text-secondary"
            }`}
          >
            In-Person
          </button>
        </div>

        {supportsInPerson && (
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Office Address</label>
            <input
              type="text"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder="e.g. 5F Kayod HQ, Cebu IT Park"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              This will be used as the default interview location.
            </p>
          </div>
        )}

        {application.selected_mode && (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Candidate selected: {application.selected_mode === "online" ? "Online" : "In-Person"}
          </p>
        )}

        {availabilityError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{availabilityError}</p>
        )}

        <button
          type="button"
          onClick={handleAvailabilitySave}
          disabled={isSavingAvailability}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSavingAvailability ? "Saving..." : "Save Interview Preferences"}
        </button>
      </div>

      {/* Action Buttons */}
      {nextActions.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-3">
          <p className="text-xs font-medium uppercase text-text-secondary mb-4">Actions</p>
          {nextActions.map((action) => (
            <button
              key={action.status}
              onClick={() => handleStatusChange(action.status)}
              disabled={isLoading}
              className={`w-full py-3 px-4 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${action.color} hover:opacity-90`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Move to Applied Button - For Rejected Status */}
      {application?.status === "rejected" && (
        <div className="rounded-2xl border border-border bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-900 mb-2">Reconsider Candidate</p>
          <p className="text-xs text-amber-700 mb-4">
            Move this candidate back to active consideration. They will receive a notification.
          </p>
          <button
            onClick={() => handleStatusChange("submitted")}
            disabled={isLoading}
            className="w-full py-3 px-4 text-sm font-medium text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            Move to Active Consideration
          </button>
        </div>
      )}

      {/* Schedule Interview Button */}
      {application?.status === "shortlisted" && (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm font-semibold text-text-primary mb-3">Schedule Interview</p>
          <p className="text-xs text-text-secondary mb-3">
            Schedule after the candidate confirms their format selection.
          </p>
          <a
            href={`/interviews/schedule?applicationId=${application.id}`}
            className="block w-full rounded-lg bg-purple-500 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-purple-600"
          >
            Open Scheduling
          </a>
        </div>
      )}

      {/* Candidate Info Card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs font-medium uppercase text-text-secondary mb-4">Timeline</p>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Applied:</span>
            <span className="text-text-primary font-medium">
              {new Date(application?.submitted_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Days in Pipeline:</span>
            <span className="text-text-primary font-medium">
              {Math.floor(
                (new Date().getTime() - new Date(application?.submitted_at).getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{" "}
              days
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
