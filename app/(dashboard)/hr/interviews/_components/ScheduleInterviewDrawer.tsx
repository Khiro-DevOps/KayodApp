"use client";

import React, { useState, useTransition } from "react";
import { createInterviewInvite, getOfficeBranches, getNextAvailableInterviewSlot } from "@/app/actions/interviews";
import { checkPhtWorkHoursWarning, phtInputToUtcIso, utcToPhtInputString } from "@/lib/interview-date";
import { DEFAULT_DURATION_MINUTES } from "@/lib/interview-schedule-config";

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
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_DURATION_MINUTES);
  const [meetingLink, setMeetingLink] = useState<string>("");
  const [meetingType, setMeetingType] = useState<"online" | "in_person" | "hybrid">("hybrid");
  const [branches, setBranches] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
  const [officeBranchId, setOfficeBranchId] = useState("");
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [slots, setSlots] = useState<Array<{ start_time: string; end_time: string }>>([
    { start_time: "", end_time: "" },
  ]);
  const [slotHints, setSlotHints] = useState<Record<number, string | null>>({});
  const [touchedStarts, setTouchedStarts] = useState<Record<number, boolean>>({});
  const [touchedEnds, setTouchedEnds] = useState<Record<number, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    void getOfficeBranches().then((result) => {
      const data = result.success ? (result.data ?? []) : [];
      setBranches(data);
      setBranchesLoaded(true);
      if (data.length === 0) {
        setMeetingType("online");
        setOfficeBranchId("");
      } else if (data.length === 1) {
        setOfficeBranchId(data[0].id);
      }
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    void getNextAvailableInterviewSlot({
      applicationId: applicationId || undefined,
      interviewerId: interviewerId || undefined,
      durationMinutes,
    }).then((res) => {
      if (isMounted) {
        setSlots((prev) => {
          if (touchedStarts[0]) return prev;
          const newSlots = [...prev];
          newSlots[0] = {
            start_time: utcToPhtInputString(res.start_time),
            end_time: utcToPhtInputString(res.end_time),
          };
          return newSlots;
        });
        if (!touchedStarts[0]) {
          setSlotHints((prev) => ({
            ...prev,
            0: res.movedReason ?? null,
          }));
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, applicationId, interviewerId, durationMinutes, touchedStarts]);

  if (!isOpen) return null;

  const handleAddSlot = () => {
    if (slots.length >= 3) return;
    setSlots([...slots, { start_time: "", end_time: "" }]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== index));
    setSlotHints((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  const handleDurationChange = (newDuration: number) => {
    setDurationMinutes(newDuration);
    setSlots((prev) =>
      prev.map((slot, idx) => {
        if (slot.start_time && !touchedEnds[idx]) {
          try {
            const startIso = phtInputToUtcIso(slot.start_time);
            const endIso = new Date(new Date(startIso).getTime() + newDuration * 60_000).toISOString();
            return {
              ...slot,
              end_time: utcToPhtInputString(endIso),
            };
          } catch {
            return slot;
          }
        }
        return slot;
      })
    );
  };

  const handleSlotChange = (index: number, field: "start_time" | "end_time", value: string) => {
    if (field === "start_time") {
      setTouchedStarts((prev) => ({ ...prev, [index]: true }));
      setSlotHints((prev) => ({ ...prev, [index]: null }));
    } else {
      setTouchedEnds((prev) => ({ ...prev, [index]: true }));
    }

    setSlots((prev) => {
      const newSlots = [...prev];
      newSlots[index] = { ...newSlots[index], [field]: value };
      if (field === "start_time" && value && !touchedEnds[index]) {
        try {
          const startIso = phtInputToUtcIso(value);
          const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60_000).toISOString();
          newSlots[index].end_time = utcToPhtInputString(endIso);
        } catch {
          // ignore parsing error during typing
        }
      }
      return newSlots;
    });
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

    // Convert PHT datetime-local format to UTC ISO strings
    try {
      const isoSlots = slots.map((s) => ({
        start_time: phtInputToUtcIso(s.start_time),
        end_time: phtInputToUtcIso(s.end_time),
      }));

      startTransition(async () => {
        try {
          const res = await createInterviewInvite({
            application_id: applicationId,
            interviewer_id: interviewerId,
            slots: isoSlots,
            duration_minutes: durationMinutes,
            meeting_link: meetingLink.trim() || undefined,
            meeting_type: meetingType,
            office_branch_id: meetingType === "in_person" || meetingType === "hybrid" ? officeBranchId : null,
          });

          if (!res.success) {
            setErrorMsg(res.error || "Failed to schedule interview.");
          } else {
            onClose();
          }
        } catch (err: unknown) {
          setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      });
    } catch (parseErr) {
      setErrorMsg(parseErr instanceof Error ? parseErr.message : "Invalid date/time format.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Schedule Candidate Interview</h3>
            <p className="text-xs text-slate-500">
              Propose 1 to 3 time slots for the candidate to select.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Candidate Application */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Select Candidate & Job Application
            </label>
            <select
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
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
            <label className="text-xs font-semibold text-slate-700">
              Assigned Interviewer
            </label>
            <select
              value={interviewerId}
              onChange={(e) => setInterviewerId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            >
              <option value="">-- Choose Interviewer --</option>
              {interviewers.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Interview Duration
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes (1 hour)</option>
              <option value={90}>90 minutes (1.5 hours)</option>
              <option value={120}>120 minutes (2 hours)</option>
            </select>
          </div>

          {/* Video Meeting Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Interview Mode</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMeetingType("online")}
                className={`rounded-xl border p-2.5 text-xs text-center ${
                  meetingType === "online" ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold" : "border-slate-200 text-slate-700"
                }`}
              >
                Online
              </button>
              <button
                type="button"
                disabled={branchesLoaded && branches.length === 0}
                onClick={() => setMeetingType("in_person")}
                className={`rounded-xl border p-2.5 text-xs text-center ${
                  branchesLoaded && branches.length === 0
                    ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
                    : meetingType === "in_person"
                    ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold"
                    : "border-slate-200 text-slate-700"
                }`}
              >
                In-Person
              </button>
              <button
                type="button"
                disabled={branchesLoaded && branches.length === 0}
                onClick={() => setMeetingType("hybrid")}
                className={`rounded-xl border p-2.5 text-xs text-center ${
                  branchesLoaded && branches.length === 0
                    ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
                    : meetingType === "hybrid"
                    ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold"
                    : "border-slate-200 text-slate-700"
                }`}
              >
                Both (Hybrid)
              </button>
            </div>
            {branchesLoaded && branches.length === 0 && (
              <p className="text-[11px] text-amber-600">
                No office branches configured. Only Online mode is available.
              </p>
            )}
          </div>
          {(meetingType === "in_person" || meetingType === "hybrid") && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Office Branch</label>
              <select
                value={officeBranchId}
                onChange={(e) => setOfficeBranchId(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
              >
                <option value="">Select office branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} — {branch.address}
                  </option>
                ))}
              </select>
            </div>
          )}
          {meetingType === "online" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Meeting Link (Optional)
              </label>
              <input
                type="url"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/xyz or leave blank for auto-generated room"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              />
            </div>
          )}

          {/* Time Slots (1-3) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-slate-700 block">
                  Proposed Time Slots ({slots.length}/3)
                </label>
                <span className="text-[11px] text-slate-500">
                  Times in Philippine Standard Time (PHT, UTC+8)
                </span>
              </div>
              {slots.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="text-xs font-semibold text-primary hover:text-primary-dark"
                >
                  + Add Slot
                </button>
              )}
            </div>

            {slots.map((slot, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
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
                    <label className="block text-[10px] text-slate-500 mb-1">Start Time (PHT)</label>
                    <input
                      type="datetime-local"
                      value={slot.start_time}
                      onChange={(e) => handleSlotChange(index, "start_time", e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900"
                    />
                    {slotHints[index] && (
                      <p className="mt-1 text-[11px] text-amber-600 font-medium leading-tight">
                        {slotHints[index]}
                      </p>
                    )}
                    {checkPhtWorkHoursWarning(slot.start_time, durationMinutes) && (
                      <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 rounded p-1 leading-tight border border-amber-200">
                        {checkPhtWorkHoursWarning(slot.start_time, durationMinutes)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">End Time (PHT)</label>
                    <input
                      type="datetime-local"
                      value={slot.end_time}
                      onChange={(e) => handleSlotChange(index, "end_time", e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
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
