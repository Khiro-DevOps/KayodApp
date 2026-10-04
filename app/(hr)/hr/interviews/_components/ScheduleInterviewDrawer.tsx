"use client";

import React, { useState, useTransition } from "react";
import { createInterviewInvite } from "@/app/actions/interviews";

interface ApplicationOption {
  id: string;
  candidateName: string;
  jobTitle: string;
}

interface InterviewerOption {
  id: string;
  name: string;
}

interface ScheduleInterviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  applications: ApplicationOption[];
  interviewers: InterviewerOption[];
  defaultApplicationId?: string;
}

export function ScheduleInterviewDrawer({
  isOpen,
  onClose,
  applications,
  interviewers,
  defaultApplicationId = "",
}: ScheduleInterviewDrawerProps) {
  const [applicationId, setApplicationId] = useState<string>(defaultApplicationId);
  const [interviewerId, setInterviewerId] = useState<string>(interviewers[0]?.id || "");
  const [meetingLink, setMeetingLink] = useState<string>("");
  const [slots, setSlots] = useState<Array<{ start_time: string; end_time: string }>>([
    { start_time: "", end_time: "" },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleAddSlot = () => {
    if (slots.length >= 3) return;
    setSlots([...slots, { start_time: "", end_time: "" }]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== index));
  };

  const handleSlotChange = (index: number, field: "start_time" | "end_time", value: string) => {
    const newSlots = [...slots];
    newSlots[index][field] = value;
    setSlots(newSlots);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!applicationId || !interviewerId) {
      setErrorMsg("Please select an application and an interviewer.");
      return;
    }

    const invalidSlot = slots.some((s) => !s.start_time || !s.end_time);
    if (invalidSlot) {
      setErrorMsg("Please fill in start and end times for all proposed slots.");
      return;
    }

    // Convert local datetime-local format to ISO string
    const isoSlots = slots.map((s) => ({
      start_time: new Date(s.start_time).toISOString(),
      end_time: new Date(s.end_time).toISOString(),
    }));

    startTransition(async () => {
      const res = await createInterviewInvite({
        application_id: applicationId,
        interviewer_id: interviewerId,
        slots: isoSlots,
        meeting_link: meetingLink.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to schedule interview.");
      } else {
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl dark:bg-slate-900 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Schedule Candidate Interview</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Propose 1 to 3 time slots for the candidate to select.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Candidate Application */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Candidate & Job Application
            </label>
            <select
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            >
              <option value="">-- Choose Candidate --</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.candidateName} – {app.jobTitle}
                </option>
              ))}
            </select>
          </div>

          {/* Interviewer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Assigned Interviewer
            </label>
            <select
              value={interviewerId}
              onChange={(e) => setInterviewerId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            >
              <option value="">-- Choose Interviewer --</option>
              {interviewers.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name}
                </option>
              ))}
            </select>
          </div>

          {/* Video Meeting Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Meeting Link (Optional)
            </label>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/xyz or leave blank for auto-generated room"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            />
          </div>

          {/* Time Slots (1-3) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Proposed Time Slots ({slots.length}/3)
              </label>
              {slots.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400"
                >
                  + Add Slot
                </button>
              )}
            </div>

            {slots.map((slot, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span>Slot #{index + 1}</span>
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">Start Time</label>
                    <input
                      type="datetime-local"
                      value={slot.start_time}
                      onChange={(e) => handleSlotChange(index, "start_time", e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      value={slot.end_time}
                      onChange={(e) => handleSlotChange(index, "end_time", e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Scheduling..." : "Send Interview Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
