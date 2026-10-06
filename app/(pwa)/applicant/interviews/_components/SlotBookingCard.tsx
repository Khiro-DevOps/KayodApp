"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { selectInterviewSlot, requestReschedule, TimeSlot } from "@/app/actions/interviews";
import { CalendarExportButton } from "./CalendarExportButton";
import { getRoomAccess } from "@/lib/interview-room-access";

export interface InterviewScheduleItem {
  id: string;
  application_id: string;
  interviewer_id?: string | null;
  applicant_id?: string | null;
  proposed_slots: TimeSlot[];
  selected_slot?: TimeSlot | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  status: "proposed" | "scheduled" | "rescheduled" | "pending_selection" | "confirmed" | "reschedule_requested" | "completed" | "cancelled";
  reschedule_reason?: string | null;
  meeting_link?: string | null;
  meeting_type?: "online" | "in_person" | "hybrid";
  branchName?: string | null;
  branchAddress?: string | null;
  jobTitle: string;
  interviewerName?: string | null;
}

interface SlotBookingCardProps {
  interview: InterviewScheduleItem;
}

export function SlotBookingCard({ interview }: SlotBookingCardProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string>(
    interview.selected_slot?.slot_id || interview.proposed_slots[0]?.slot_id || ""
  );
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = interview.status === "confirmed" || interview.status === "scheduled";
  const isRescheduleRequested = interview.status === "reschedule_requested" || interview.status === "rescheduled";
  const isCompleted = interview.status === "completed";
  const isCancelled = interview.status === "cancelled";

  // Dynamic meeting link check: active 10 mins prior to scheduled start time
  const isMeetingLinkActive = () => {
    if (!interview.selected_slot?.start_time) return false;
    const startTimeMs = new Date(interview.selected_slot.start_time).getTime();
    const nowMs = Date.now();
    // 10 mins before start time up until 4 hours after
    return nowMs >= startTimeMs - 10 * 60 * 1000 && nowMs <= startTimeMs + 4 * 360 * 1000;
  };

  const activeLink = (interview.meeting_type === "online" || interview.meeting_type === "hybrid") && getRoomAccess({
    scheduled_at: interview.scheduled_at ?? interview.selected_slot?.start_time,
    duration_minutes: interview.duration_minutes,
    status: interview.status,
    meeting_type: interview.meeting_type,
  }).state === "open";

  const handleConfirmSlot = () => {
    if (!selectedSlotId) return;
    setErrorMessage(null);
    startTransition(async () => {
      const res = await selectInterviewSlot(interview.id, selectedSlotId);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to confirm time slot.");
      }
    });
  };

  const handleRequestReschedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleReason.trim()) return;
    setErrorMessage(null);
    startTransition(async () => {
      const res = await requestReschedule(interview.id, rescheduleReason);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to submit reschedule request.");
      } else {
        setIsRescheduleOpen(false);
        setRescheduleReason("");
      }
    });
  };

  const formatSlotTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{interview.jobTitle}</h3>
          {interview.interviewerName && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Interviewer: {interview.interviewerName}</p>
          )}
        </div>
        <div>
          {interview.status === "pending_selection" && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Pending Time Selection
            </span>
          )}
          {interview.status === "confirmed" && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Confirmed
            </span>
          )}
          {interview.status === "reschedule_requested" && (
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
              Reschedule Requested
            </span>
          )}
          {interview.status === "completed" && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Completed
            </span>
          )}
          {interview.status === "cancelled" && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-300">
              Cancelled
            </span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Pending Selection Options */}
      {interview.status === "pending_selection" && (
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Please choose 1 preferred time slot:
          </p>
          <div className="space-y-2">
            {interview.proposed_slots.map((slot) => {
              const isSelected = selectedSlotId === slot.slot_id;
              return (
                <label
                  key={slot.slot_id}
                  onClick={() => setSelectedSlotId(slot.slot_id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-all ${
                    isSelected
                      ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-600 dark:border-purple-500 dark:bg-purple-950/30"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`slot_${interview.id}`}
                      checked={isSelected}
                      onChange={() => setSelectedSlotId(slot.slot_id)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {formatSlotTime(slot.start_time)} – {new Date(slot.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsRescheduleOpen(true)}
              className="text-xs font-semibold text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400"
            >
              Request Different Time
            </button>
            <button
              type="button"
              onClick={handleConfirmSlot}
              disabled={isPending || !selectedSlotId}
              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Confirming..." : "Confirm Time Slot"}
            </button>
          </div>
        </div>
      )}

      {/* Confirmed Slot Details & Video Join */}
      {isConfirmed && interview.selected_slot && (
        <div className="space-y-3 pt-2">
          <div className="rounded-xl bg-purple-50 p-3 text-xs text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
            <span className="font-bold">Scheduled Time: </span>
            {formatSlotTime(interview.selected_slot.start_time)} – {new Date(interview.selected_slot.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {interview.meeting_type === "in_person" || interview.meeting_type === "hybrid" ? (
              <p className="text-xs text-amber-800 dark:text-amber-300">In-Person at {interview.branchName ?? "office"}{interview.branchAddress ? `, ${interview.branchAddress}` : ""}</p>
            ) : activeLink ? (
              <Link
                href={`/applicant/interviews/${interview.id}/room`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Join Video Call
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500"
                title="Link activates 10 minutes prior to scheduled interview time"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Video Link (Active 10m Prior)
              </button>
            )}

            <CalendarExportButton
              title={`Interview: ${interview.jobTitle}`}
              startTime={interview.selected_slot.start_time}
              endTime={interview.selected_slot.end_time}
              meetingLink={interview.meeting_type === "online" || interview.meeting_type === "hybrid" ? `/applicant/interviews/${interview.id}/room` : undefined}
            />

            <button
              type="button"
              onClick={() => setIsRescheduleOpen(true)}
              className="ml-auto text-xs font-semibold text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-400"
            >
              Reschedule
            </button>
          </div>
        </div>
      )}

      {/* Reschedule Requested Info */}
      {isRescheduleRequested && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300">
          <p className="font-semibold">Reschedule request pending with HR.</p>
          {interview.reschedule_reason && (
            <p className="mt-1 text-slate-600 dark:text-slate-400">Reason: {interview.reschedule_reason}</p>
          )}
        </div>
      )}

      {/* Reschedule Modal */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 space-y-4">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">Request Reschedule</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Please provide a reason or your preferred availability for HR to review.
            </p>
            <form onSubmit={handleRequestReschedule} className="space-y-4">
              <textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Explain why you need to reschedule and suggest alternative dates..."
                rows={3}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRescheduleOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !rescheduleReason.trim()}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
