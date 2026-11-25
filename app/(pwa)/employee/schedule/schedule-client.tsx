"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  cancelOvertimeRequestAction,
  clockInAction,
  clockOutAction,
  reopenShiftAction,
  submitAttendanceCorrectionAction,
  submitOvertimeRequestAction,
  submitWorkModeRequestAction,
  toggleLunchAction,
  toggleShortBreakAction,
  updateLiveAttendanceLocationAction,
} from "./actions";
import { cancelUndertimeRequestAction } from "@/app/actions/undertime";
import WorkspaceMap from "@/components/schedule/workspace-map";
import ApplyUndertimeModal from "@/components/undertime/ApplyUndertimeModal";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import { validateAndClassifyOvertimeRequest } from "@/lib/shift-calculations";
import {
  computeLeaveOffsetDays,
  formatTime12h as formatUndertime12h,
  formatUndertimeTypeLabel,
  isTodayPht,
  type UndertimeRequestSummary,
} from "@/lib/undertime";

const CORRECTION_TYPES = [
  "Accidental Clock-Out",
  "Missed Clock-Out",
  "Wrong Clock-In/Out Time",
  "Missing Shift",
] as const;

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export interface WeeklyShiftRow {
  dateStr: string;
  dayShort: string;
  dayFull: string;
  dayNumber: number;
  isToday: boolean;
  isPast: boolean;
  isOff: boolean;
  isOnsite: boolean;
  dayMode: "onsite" | "wfh" | "off";
  leaveType: string | null;
  shiftTitle: string;
  statusLabel: string;
  statusStyle: string;
  formattedShiftRange: string;
  scheduledOut: string;
}

export interface RecentAttendanceLog {
  id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string | null;
  total_hours: number | null;
  zone_status: string | null;
}

export interface CorrectionRequestSummary {
  id: string;
  attendance_log_id: string | null;
  target_date: string;
  correction_type: string;
  status: string;
  requested_clock_in: string;
  requested_clock_out: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface OvertimeRequestSummary {
  id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  overtime_type?: string | null;
  reason: string;
  status: string;
  review_note: string | null;
  used_at: string | null;
  created_at: string;
}

export interface WorkModeRequestSummary {
  id: string;
  request_date: string;
  requested_mode: "onsite" | "wfh";
  reason: string;
  status: string;
  reviewer_remarks: string | null;
  created_at: string;
}

interface AttendanceLog {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  verification_type: string | null;
  distance_meters?: number | null;
  zone_status?: string | null;
  break_status?: string | null;
  active_break_type?: string | null;
  lunch_start?: string | null;
  lunch_end?: string | null;
  total_lunch_minutes?: number | null;
  break_start?: string | null;
  total_break_minutes?: number | null;
  short_breaks_used?: number | null;
  overbreak_minutes?: number | null;
  overtime_request_id?: string | null;
  outside_approved_window?: boolean | null;
  break_log?: Array<{ type: string; started_at?: string; ended_at?: string | null }> | null;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface ScheduleClientProps {
  employeeId: string;
  hasSupervisor: boolean;
  availableVlCredits: number;
  workModel: "onsite" | "wfh" | "hybrid";
  workSetupLabel: string;
  todayDailyModelLabel: string;
  todayWorkModel?: "onsite" | "wfh" | "off";
  todayApprovedLeave?: { leave_type: string } | null;
  overtimeRequests?: OvertimeRequestSummary[];
  workModeRequests?: WorkModeRequestSummary[];
  undertimeRequests?: UndertimeRequestSummary[];
  weekDays: WeeklyShiftRow[];
  weekRangeLabel: string;
  isSchedulePublished: boolean;
  workDays?: string[];
  dailyWorkModes?: Record<string, string> | null;
  isTodayOnsite: boolean;
  hasOfficeCoordinates: boolean;
  shiftStart: string;
  shiftEnd: string;
  lunchStart?: string;
  lunchEnd?: string;
  initialActiveLog: AttendanceLog | null;
  initialTodayCompletedLog?: RecentAttendanceLog | null;
  recentLogs?: RecentAttendanceLog[];
  correctionRequests?: CorrectionRequestSummary[];
  todayDateStr?: string;
  allowedRadiusMeters?: number;
  locationName: string;
  locationAddress: string;
  targetOfficeCoords: { lat: number; lng: number; name: string } | null;
  geofenceError?: string | null;
  remoteAddress: string;
}

function formatTime12h(timeStr: string) {
  return formatUndertime12h(timeStr);
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function toPhtTimeInput(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "08";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function getUndertimeBadge(req: UndertimeRequestSummary) {
  if (req.status === "pending_supervisor") {
    return {
      label: `Pending Supervisor (${req.undertime_minutes}m)`,
      cls: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (req.status === "pending_hr") {
    return {
      label: `Pending HR (${req.undertime_minutes}m)`,
      cls: "border-indigo-200 bg-indigo-50 text-indigo-700",
    };
  }
  if (req.status === "approved") {
    if (req.undertime_type === "late_in" && req.requested_in) {
      return {
        label: `Approved In: ${formatUndertime12h(req.requested_in)}`,
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    if (
      req.undertime_type === "half_day_first" ||
      req.undertime_type === "half_day_second"
    ) {
      return {
        label: `Approved ${formatUndertimeTypeLabel(req.undertime_type)}`,
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    return {
      label: `Approved Out: ${formatUndertime12h(req.requested_out)}`,
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (req.status === "rejected") {
    return {
      label: "Undertime Rejected",
      cls: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  return {
    label: "Cancelled",
    cls: "border-slate-200 bg-slate-100 text-slate-600",
  };
}

export default function ScheduleClient({
  hasSupervisor,
  availableVlCredits,
  workModel,
  workSetupLabel,
  todayDailyModelLabel,
  todayWorkModel = "onsite",
  todayApprovedLeave = null,
  overtimeRequests = [],
  workModeRequests = [],
  undertimeRequests = [],
  weekDays,
  weekRangeLabel,
  isSchedulePublished,
  workDays = [],
  dailyWorkModes = null,
  isTodayOnsite,
  hasOfficeCoordinates,
  shiftStart,
  shiftEnd,
  lunchStart = "12:00",
  lunchEnd = "13:00",
  initialActiveLog,
  initialTodayCompletedLog = null,
  recentLogs = [],
  correctionRequests = [],
  todayDateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  allowedRadiusMeters = 100,
  locationName,
  locationAddress,
  targetOfficeCoords,
  geofenceError,
  remoteAddress,
}: ScheduleClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attendanceCardRef = useRef<HTMLDivElement>(null);
  const [activeLog, setActiveLog] = useState<AttendanceLog | null>(initialActiveLog);
  const [todayCompletedLog, setTodayCompletedLog] = useState<RecentAttendanceLog | null>(
    initialTodayCompletedLog
  );
  const [localRequests, setLocalRequests] =
    useState<CorrectionRequestSummary[]>(correctionRequests);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedText, setElapsedText] = useState<string>("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [optimisticBreakStartIso, setOptimisticBreakStartIso] = useState<string | null>(null);

  // Mobile map collapse state (collapsed by default on <768px, expanded on desktop)
  const [isMapExpanded, setIsMapExpanded] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMapExpanded(false);
    }
  }, []);

  // Mobile "+ Time Request" menu
  const [showMobileRequestMenu, setShowMobileRequestMenu] = useState(false);

  // Undertime Request state & modal
  const [localUndertimeRequests, setLocalUndertimeRequests] =
    useState<UndertimeRequestSummary[]>(undertimeRequests);
  const [showUndertimeModal, setShowUndertimeModal] = useState(false);
  const [utModalDate, setUtModalDate] = useState(todayDateStr);
  const [utModalScheduledOut, setUtModalScheduledOut] = useState(shiftEnd);
  const [utLockDate, setUtLockDate] = useState(false);
  const [cancellingUtId, setCancellingUtId] = useState<string | null>(null);

  // Clock-Out confirmation modal state
  const [showClockOutModal, setShowClockOutModal] = useState(false);

  // Attendance Correction Request modal state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionLogId, setCorrectionLogId] = useState<string | null>(null);
  const [correctionDate, setCorrectionDate] = useState(todayDateStr);
  const [correctionType, setCorrectionType] = useState<string>("Wrong Clock-In/Out Time");
  const [correctionClockInTime, setCorrectionClockInTime] = useState(
    shiftStart.slice(0, 5) || "08:00"
  );
  const [correctionClockOutTime, setCorrectionClockOutTime] = useState(
    shiftEnd.slice(0, 5) || "17:00"
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Overtime Request state & modal
  const [localOtRequests, setLocalOtRequests] =
    useState<OvertimeRequestSummary[]>(overtimeRequests);
  const [showOtModal, setShowOtModal] = useState(false);
  const [otWorkDate, setOtWorkDate] = useState(todayDateStr);
  const [otStartTime, setOtStartTime] = useState(shiftStart.slice(0, 5) || "08:00");
  const [otEndTime, setOtEndTime] = useState(shiftEnd.slice(0, 5) || "17:00");
  const [otReason, setOtReason] = useState("");
  const [submittingOt, setSubmittingOt] = useState(false);
  const [cancellingOtId, setCancellingOtId] = useState<string | null>(null);

  // Work Mode Change Request state & modal
  const [localWorkModeRequests, setLocalWorkModeRequests] =
    useState<WorkModeRequestSummary[]>(workModeRequests);
  const [showWorkModeModal, setShowWorkModeModal] = useState(false);
  const [wmDate, setWmDate] = useState(todayDateStr);
  const [wmMode, setWmMode] = useState<"wfh" | "onsite">(
    todayWorkModel === "onsite" ? "wfh" : "onsite"
  );
  const [wmReason, setWmReason] = useState("");
  const [submittingWm, setSubmittingWm] = useState(false);

  // Geolocation & network state
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(
    initialActiveLog?.distance_meters ?? null
  );
  const [isInZone, setIsInZone] = useState<boolean>(
    initialActiveLog ? initialActiveLog.zone_status !== "outside_zone" : true
  );
  const lastSentDistanceRef = useRef<number | null>(
    initialActiveLog?.distance_meters ?? null
  );
  const lastSentInZoneRef = useRef<boolean>(
    initialActiveLog ? initialActiveLog.zone_status !== "outside_zone" : true
  );
  const lastSentAtRef = useRef<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Soft-blocking modal state
  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    distanceKm: number;
  } | null>(null);

  useEffect(() => {
    if (searchParams.get("view") === "attendance" && attendanceCardRef.current) {
      attendanceCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      attendanceCardRef.current.focus({ preventScroll: true });
    }
  }, [searchParams]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 10,
          });
          if (targetOfficeCoords) {
            const meters = Math.round(
              calculateDistanceKm(
                pos.coords.latitude,
                pos.coords.longitude,
                targetOfficeCoords.lat,
                targetOfficeCoords.lng
              ) * 1000
            );
            setDistanceMeters((prev) => prev ?? meters);
            setIsInZone(meters <= allowedRadiusMeters);
          }
        },
        (err) => {
          console.log("Geolocation error/denied:", err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [allowedRadiusMeters, targetOfficeCoords]);

  useEffect(() => {
    if (!activeLog || activeLog.clock_out) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 10;
        setUserLocation({ lat, lng, accuracy });

        let localMeters: number | null = null;
        let nextInZone = lastSentInZoneRef.current;

        if (targetOfficeCoords) {
          localMeters = Math.round(
            calculateDistanceKm(lat, lng, targetOfficeCoords.lat, targetOfficeCoords.lng) *
              1000
          );
          nextInZone = localMeters <= allowedRadiusMeters;
          setDistanceMeters(localMeters);
          setIsInZone(nextInZone);
        }

        const now = Date.now();
        const distDelta =
          localMeters !== null && lastSentDistanceRef.current !== null
            ? Math.abs(localMeters - lastSentDistanceRef.current)
            : 0;
        const zoneFlipped = nextInZone !== lastSentInZoneRef.current;
        const elapsedMs = now - lastSentAtRef.current;

        if (
          lastSentAtRef.current === 0 ||
          distDelta >= 15 ||
          zoneFlipped ||
          elapsedMs >= 45_000
        ) {
          lastSentAtRef.current = now;
          void updateLiveAttendanceLocationAction({
            attendanceLogId: activeLog.id,
            latitude: lat,
            longitude: lng,
            accuracyMeters: accuracy,
          }).then((res) => {
            if (res.success) {
              lastSentDistanceRef.current = res.distanceMeters;
              lastSentInZoneRef.current = !res.isOutside;
              setDistanceMeters(res.distanceMeters);
              setIsInZone(!res.isOutside);
            }
          });
        }
      },
      (err) => {
        console.log("Live geofence watchPosition error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeLog, allowedRadiusMeters, targetOfficeCoords]);

  useEffect(() => {
    if (!activeLog || activeLog.clock_out) {
      setElapsedText("");
      return;
    }

    const clockInTime = new Date(activeLog.clock_in);

    const updateTimer = () => {
      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - clockInTime.getTime());
      const totalMins = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;

      const formattedClockIn = clockInTime.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setElapsedText(`Clocked in at ${formattedClockIn} • ${hours}h ${mins}m elapsed`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [activeLog]);

  const activeBreakType: "lunch" | "short_break" | null =
    activeLog?.active_break_type === "lunch" ||
    activeLog?.active_break_type === "short_break"
      ? activeLog.active_break_type
      : null;

  const undoDeadlineMs =
    !activeLog && todayCompletedLog?.clock_out
      ? Date.parse(todayCompletedLog.clock_out) + UNDO_WINDOW_MS
      : NaN;
  const isWithinUndoWindow =
    Number.isFinite(undoDeadlineMs) && nowMs < undoDeadlineMs;
  const undoRemainingSeconds = isWithinUndoWindow
    ? Math.max(0, Math.ceil((undoDeadlineMs - nowMs) / 1000))
    : 0;
  const isShiftCompletedToday = Boolean(
    !activeLog && todayCompletedLog && !isWithinUndoWindow
  );

  useEffect(() => {
    if (!activeBreakType && !isWithinUndoWindow) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBreakType, isWithinUndoWindow]);

  const getPunctualityBadge = () => {
    if (!activeLog) return null;
    if (activeLog.overtime_request_id || todayWorkModel === "off") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-[#1E1B4B] border border-indigo-200">
          Overtime Shift
        </span>
      );
    }
    const clockInTime = new Date(activeLog.clock_in);
    const [targetH, targetM] = shiftStart.split(":").map((n) => parseInt(n, 10));

    const scheduledDate = new Date(clockInTime);
    scheduledDate.setHours(
      Number.isNaN(targetH) ? 8 : targetH,
      Number.isNaN(targetM) ? 0 : targetM,
      0,
      0
    );

    const diffMins = Math.floor(
      (clockInTime.getTime() - scheduledDate.getTime()) / (1000 * 60)
    );

    if (diffMins <= 5) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
          ✓ On Time
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
        ⚠️ Late by {diffMins} mins
      </span>
    );
  };

  const submitClockInPayload = async (
    lat: number,
    lng: number,
    accuracy: number,
    reason?: string
  ) => {
    setLoading(true);
    setErrorMessage(null);

    const res = await clockInAction({
      latitude: lat,
      longitude: lng,
      accuracy_meters: accuracy,
      flag_reason: reason,
    });

    if (!res.success) {
      setErrorMessage(res.error);
      toast.error(res.error);
    } else {
      setActiveLog({
        id: res.logId,
        clock_in: res.clockIn ?? new Date().toISOString(),
        clock_out: null,
        status: res.status,
        verification_type: res.location_used,
        distance_meters: res.distanceMeters,
        zone_status: res.zone_status,
        break_status: "active",
      });
      setTodayCompletedLog(null);
      setDistanceMeters(res.distanceMeters);
      setIsInZone(res.zone_status !== "outside_zone");
      lastSentDistanceRef.current = res.distanceMeters;
      lastSentInZoneRef.current = res.zone_status !== "outside_zone";
      lastSentAtRef.current = Date.now();
      setShowOutsideModal(false);
      setFlagReason("");
      setPendingCoords(null);
      toast.success(res.message);
      router.refresh();
    }
    setLoading(false);
  };

  const handleClockIn = async () => {
    setLoading(true);
    setErrorMessage(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 10;
        setUserLocation({ lat, lng, accuracy });
        submitClockInPayload(lat, lng, accuracy);
      },
      (err) => {
        setErrorMessage("Unable to acquire location for clock-in: " + err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagReason.trim()) return;
    if (pendingCoords) {
      submitClockInPayload(
        pendingCoords.lat,
        pendingCoords.lng,
        pendingCoords.accuracy,
        flagReason.trim()
      );
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;
    setLoading(true);
    setErrorMessage(null);

    const closedLogSnapshot: RecentAttendanceLog = {
      id: activeLog.id,
      date: todayDateStr,
      clock_in: activeLog.clock_in,
      clock_out: new Date().toISOString(),
      status: "completed",
      total_hours: null,
      zone_status: activeLog.zone_status ?? null,
    };

    const res = await clockOutAction(activeLog.id);
    if (!res.success) {
      setErrorMessage(res.error);
      toast.error(res.error);
    } else {
      setActiveLog(null);
      setTodayCompletedLog(closedLogSnapshot);
      setNowMs(Date.now());
      setElapsedText("");
      setOptimisticBreakStartIso(null);
      setShowClockOutModal(false);
      toast.success("Clocked out. You have 5 minutes to undo if this was accidental.");
      router.refresh();
    }
    setLoading(false);
  };

  const handleReopenShift = async () => {
    if (!todayCompletedLog) return;
    setLoading(true);
    setErrorMessage(null);

    const res = await reopenShiftAction(todayCompletedLog.id);
    if (!res.success) {
      setErrorMessage(res.error);
      toast.error(res.error);
    } else {
      setActiveLog(res.log);
      setTodayCompletedLog(null);
      toast.success(res.message);
      router.refresh();
    }
    setLoading(false);
  };

  const openUndertimeModal = (
    dateStr = todayDateStr,
    scheduledOutHm = shiftEnd,
    lockDate = false
  ) => {
    setUtModalDate(dateStr);
    setUtModalScheduledOut(scheduledOutHm);
    setUtLockDate(lockDate);
    setShowUndertimeModal(true);
    setShowMobileRequestMenu(false);
  };

  const handleCancelUndertime = async (requestId: string) => {
    setCancellingUtId(requestId);
    try {
      const res = await cancelUndertimeRequestAction(requestId);
      if (!res.success) {
        toast.error(res.error ?? "Failed to cancel undertime request.");
        return;
      }
      setLocalUndertimeRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "cancelled" } : r))
      );
      toast.success(res.message ?? "Undertime request cancelled.");
      router.refresh();
    } finally {
      setCancellingUtId(null);
    }
  };

  const openCorrectionModal = (opts?: {
    log?: RecentAttendanceLog | null;
    defaultDate?: string;
    defaultType?: string;
  }) => {
    const targetLog = opts?.log ?? null;
    const dateVal = targetLog?.date ?? opts?.defaultDate ?? todayDateStr;
    setCorrectionLogId(targetLog?.id ?? null);
    setCorrectionDate(dateVal);
    setCorrectionType(
      opts?.defaultType ??
        (targetLog?.clock_out
          ? "Wrong Clock-In/Out Time"
          : targetLog
            ? "Missed Clock-Out"
            : "Missing Shift")
    );
    setCorrectionClockInTime(
      toPhtTimeInput(targetLog?.clock_in, shiftStart.slice(0, 5) || "08:00")
    );
    setCorrectionClockOutTime(
      toPhtTimeInput(targetLog?.clock_out, shiftEnd.slice(0, 5) || "17:00")
    );
    setCorrectionReason("");
    setShowCorrectionModal(true);
    setShowMobileRequestMenu(false);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCorrection(true);

    const requestedClockIn = `${correctionDate}T${correctionClockInTime}:00+08:00`;
    const requestedClockOut = correctionClockOutTime
      ? `${correctionDate}T${correctionClockOutTime}:00+08:00`
      : null;

    const res = await submitAttendanceCorrectionAction({
      attendanceLogId: correctionLogId,
      targetDate: correctionDate,
      correctionType,
      requestedClockIn,
      requestedClockOut,
      reason: correctionReason,
    });

    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setLocalRequests((prev) => [
        {
          id: res.requestId,
          attendance_log_id: correctionLogId,
          target_date: correctionDate,
          correction_type: correctionType,
          status: "pending",
          requested_clock_in: new Date(requestedClockIn).toISOString(),
          requested_clock_out: requestedClockOut
            ? new Date(requestedClockOut).toISOString()
            : null,
          review_notes: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setShowCorrectionModal(false);
      router.refresh();
    }
    setSubmittingCorrection(false);
  };

  const getCorrectionForDateOrLog = (dateStr: string, logId?: string | null) =>
    localRequests.find(
      (r) => (logId && r.attendance_log_id === logId) || r.target_date === dateStr
    ) ?? null;

  const todayCorrection = getCorrectionForDateOrLog(todayDateStr, todayCompletedLog?.id);

  const todayOtRequests = localOtRequests.filter((r) => r.work_date === todayDateStr);
  const todayApprovedOt =
    todayOtRequests.find((r) => r.status === "approved" && !r.used_at) ?? null;
  const todayPendingOt =
    todayOtRequests.find((r) =>
      ["pending", "pending_supervisor", "pending_hr"].includes(r.status)
    ) ?? null;
  const todayRejectedOt = todayOtRequests.find((r) => r.status === "rejected") ?? null;

  const handleSubmitWorkMode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingWm(true);
    const res = await submitWorkModeRequestAction({
      requestDate: wmDate,
      requestedMode: wmMode,
      reason: wmReason,
    });
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setLocalWorkModeRequests((prev) => [
        {
          id: res.requestId ?? `temp-${Date.now()}`,
          request_date: wmDate,
          requested_mode: wmMode,
          reason: wmReason.trim(),
          status: "pending_supervisor",
          reviewer_remarks: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setShowWorkModeModal(false);
      setWmReason("");
      router.refresh();
    }
    setSubmittingWm(false);
  };

  const openOtModal = (defaultDate = todayDateStr) => {
    setOtWorkDate(defaultDate);
    const check = validateAndClassifyOvertimeRequest({
      workDate: defaultDate,
      startTime: shiftEnd.slice(0, 5) || "17:00",
      endTime: shiftEnd.slice(0, 5) || "17:00",
      workDays,
      dailyWorkModes,
      shiftStart,
      shiftEnd,
    });
    if (check.isRestDay) {
      setOtStartTime(shiftStart.slice(0, 5) || "08:00");
      setOtEndTime(shiftEnd.slice(0, 5) || "17:00");
    } else {
      const endHm = shiftEnd.slice(0, 5) || "17:00";
      const [h, m] = endHm.split(":").map(Number);
      const nextH = String(((Number.isFinite(h) ? h : 17) + 2) % 24).padStart(2, "0");
      setOtStartTime(endHm);
      setOtEndTime(`${nextH}:${String(Number.isFinite(m) ? m : 0).padStart(2, "0")}`);
    }
    setOtReason("");
    setShowOtModal(true);
    setShowMobileRequestMenu(false);
  };

  const otWindowPreview = validateAndClassifyOvertimeRequest({
    workDate: otWorkDate,
    startTime: otStartTime,
    endTime: otEndTime,
    workDays,
    dailyWorkModes,
    shiftStart,
    shiftEnd,
  });

  const handleSubmitOt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otWindowPreview.valid) {
      toast.error(otWindowPreview.error || "Invalid overtime time window.");
      return;
    }
    setSubmittingOt(true);
    const res = await submitOvertimeRequestAction({
      workDate: otWorkDate,
      startTime: otStartTime,
      endTime: otEndTime,
      overtimeType: otWindowPreview.resolvedType,
      reason: otReason,
    } as Parameters<typeof submitOvertimeRequestAction>[0]);
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setLocalOtRequests((prev) => [
        {
          id: res.requestId ?? `temp-${Date.now()}`,
          work_date: otWorkDate,
          start_time: otStartTime,
          end_time: otEndTime,
          overtime_type: otWindowPreview.resolvedType,
          reason: otReason.trim(),
          status: "pending_supervisor",
          review_note: null,
          used_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setShowOtModal(false);
      router.refresh();
    }
    setSubmittingOt(false);
  };

  const handleCancelOt = async (requestId: string) => {
    setCancellingOtId(requestId);
    const res = await cancelOvertimeRequestAction(requestId);
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      setLocalOtRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "cancelled" } : r))
      );
      router.refresh();
    }
    setCancellingOtId(null);
  };

  const isOnLunch = activeBreakType === "lunch";
  const isOnShortBreak = activeBreakType === "short_break";
  const shortBreaksUsed = activeLog?.short_breaks_used ?? 0;
  const recordedOverbreak = activeLog?.overbreak_minutes ?? 0;

  const openBreakLogEntry = Array.isArray(activeLog?.break_log)
    ? [...activeLog.break_log]
        .reverse()
        .find((entry) => entry.type === "short_break" && !entry.ended_at && entry.started_at)
    : undefined;

  const activeBreakStartIso = isOnLunch
    ? activeLog?.lunch_start ?? optimisticBreakStartIso
    : isOnShortBreak
      ? openBreakLogEntry?.started_at ?? activeLog?.break_start ?? optimisticBreakStartIso
      : null;

  const activeBreakStartMs = activeBreakStartIso ? Date.parse(activeBreakStartIso) : NaN;
  const elapsedBreakSeconds =
    activeBreakType && Number.isFinite(activeBreakStartMs)
      ? Math.max(0, Math.floor((nowMs - activeBreakStartMs) / 1000))
      : 0;
  const quotaSeconds = isOnLunch ? 3600 : 900;
  const isOverbreakActive = Boolean(activeBreakType) && elapsedBreakSeconds > quotaSeconds;
  const remainingBreakSeconds = Math.max(0, quotaSeconds - elapsedBreakSeconds);
  const activeOverbreakSeconds = Math.max(0, elapsedBreakSeconds - quotaSeconds);
  const breakProgressPct = Math.min(100, Math.round((elapsedBreakSeconds / quotaSeconds) * 100));

  const handleToggleLunch = async () => {
    if (!activeLog) return;
    setLoading(true);
    setErrorMessage(null);
    const clickIso = new Date().toISOString();
    if (!isOnLunch) {
      setOptimisticBreakStartIso(clickIso);
      setNowMs(Date.now());
    }
    const res = await toggleLunchAction(activeLog.id, !isOnLunch);
    if (!res.success) {
      setErrorMessage(res.error);
    } else {
      if (!res.active_break_type) {
        setOptimisticBreakStartIso(null);
      }
      setActiveLog((prev) =>
        prev
          ? {
              ...prev,
              active_break_type: res.active_break_type,
              break_status: res.break_status,
              lunch_start: res.lunch_start,
              lunch_end: res.lunch_end,
              break_start: res.break_start,
              total_lunch_minutes: res.total_lunch_minutes,
              total_break_minutes: res.total_break_minutes,
              short_breaks_used: res.short_breaks_used,
              overbreak_minutes: res.overbreak_minutes,
            }
          : prev
      );
    }
    setLoading(false);
  };

  const handleToggleShortBreak = async () => {
    if (!activeLog) return;
    setLoading(true);
    setErrorMessage(null);
    const clickIso = new Date().toISOString();
    if (!isOnShortBreak) {
      setOptimisticBreakStartIso(clickIso);
      setNowMs(Date.now());
    }
    const res = await toggleShortBreakAction(activeLog.id, !isOnShortBreak);
    if (!res.success) {
      setErrorMessage(res.error);
    } else {
      if (!res.active_break_type) {
        setOptimisticBreakStartIso(null);
      }
      setActiveLog((prev) =>
        prev
          ? {
              ...prev,
              active_break_type: res.active_break_type,
              break_status: res.break_status,
              lunch_start: res.lunch_start,
              lunch_end: res.lunch_end,
              break_start: res.break_start,
              total_lunch_minutes: res.total_lunch_minutes,
              total_break_minutes: res.total_break_minutes,
              short_breaks_used: res.short_breaks_used,
              overbreak_minutes: res.overbreak_minutes,
            }
          : prev
      );
    }
    setLoading(false);
  };

  // Distance pill display
  const effectiveDistanceMeters = distanceMeters ?? activeLog?.distance_meters ?? null;
  const effectiveIsInZone =
    distanceMeters !== null
      ? isInZone
      : activeLog?.zone_status
        ? activeLog.zone_status !== "outside_zone"
        : isInZone;

  let distancePillText = "In Work Zone";
  if (!targetOfficeCoords) {
    distancePillText =
      !isTodayOnsite || workModel === "wfh"
        ? "Remote geofence unconfigured"
        : "Office geofence unconfigured";
  } else if (effectiveDistanceMeters !== null) {
    const zoneLabel = effectiveIsInZone ? "In Zone" : "Outside Zone";
    distancePillText = `${effectiveDistanceMeters.toLocaleString()}m (${zoneLabel})`;
  } else if (userLocation) {
    const meters = Math.round(
      calculateDistanceKm(
        userLocation.lat,
        userLocation.lng,
        targetOfficeCoords.lat,
        targetOfficeCoords.lng
      ) * 1000
    );
    const zoneLabel = meters <= allowedRadiusMeters ? "In Zone" : "Outside Zone";
    distancePillText = `${meters.toLocaleString()}m (${zoneLabel})`;
  } else if (!isTodayOnsite || workModel === "wfh") {
    distancePillText = "In Work Zone (WFH)";
  }

  const getActiveOrLatestUndertimeForDate = (dateStr: string) => {
    const matches = localUndertimeRequests.filter((r) => r.work_date === dateStr);
    return (
      matches.find((r) =>
        ["pending_supervisor", "pending_hr", "approved"].includes(r.status)
      ) ??
      matches[0] ??
      null
    );
  };

  let modeBadgeText = "";
  let modeBadgeStyle = "";
  if (todayApprovedLeave) {
    modeBadgeText = `On Approved Leave (${todayApprovedLeave.leave_type})`;
    modeBadgeStyle = "bg-amber-100 text-amber-900 border-amber-300";
  } else if (todayWorkModel === "off") {
    modeBadgeText = "Scheduled Rest Day (Off)";
    modeBadgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
  } else if (!isTodayOnsite || workModel === "wfh") {
    modeBadgeText = "Remote / WFH Active";
    modeBadgeStyle = "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (hasOfficeCoordinates) {
    modeBadgeText = "On-Site Active (Geofence Enforced)";
    modeBadgeStyle = "bg-blue-100 text-blue-800 border-blue-200";
  } else {
    modeBadgeText = "On-Site Active (Standard Mode)";
    modeBadgeStyle = "bg-amber-100 text-amber-800 border-amber-200";
  }

  const zoneSummaryName = targetOfficeCoords?.name || locationName || remoteAddress;

  return (
    <div className="space-y-6 min-w-0">
      {/* =====================================================================
          HERO BANNER (Matches /employee/dashboard PwaHeroBanner)
         ===================================================================== */}
      <PwaHeroBanner
        title="My Schedule & Attendance"
        subtitle="Clock in from your assigned zone and track your weekly shifts"
        actions={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openUndertimeModal(todayDateStr, shiftEnd, false)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#1E1B4B] shadow-sm hover:bg-indigo-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">
                schedule_send
              </span>
              Apply for Undertime
            </button>

            {/* Desktop secondary buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => openOtModal(todayDateStr)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">more_time</span>
                Request OT
              </button>
              <button
                type="button"
                onClick={() =>
                  openCorrectionModal({
                    defaultDate: todayDateStr,
                    defaultType: "Missing Shift",
                  })
                }
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">add_circle</span>
                Missing Shift
              </button>
            </div>

            {/* Mobile compact "+ Time Request" menu (< 640px) */}
            <div className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setShowMobileRequestMenu((p) => !p)}
                className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-white/25 bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Time Request
              </button>
              {showMobileRequestMenu && (
                <div className="absolute right-0 top-12 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-xl">
                  <button
                    type="button"
                    onClick={() => openOtModal(todayDateStr)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-indigo-50"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#1E1B4B]">
                      more_time
                    </span>
                    Request OT
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openCorrectionModal({
                        defaultDate: todayDateStr,
                        defaultType: "Missing Shift",
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold hover:bg-indigo-50"
                  >
                    <span className="material-symbols-outlined text-[15px] text-[#1E1B4B]">
                      add_circle
                    </span>
                    Missing Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Today&apos;s Status</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-base font-bold text-[#1E1B4B] sm:text-lg">
                {todayDailyModelLabel}
              </p>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1E1B4B]">
                Work Setup: {workSetupLabel}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Shift Hours (PHT)</p>
            <p className="mt-1 truncate text-base font-bold text-[#1E1B4B] sm:text-lg">
              {formatTime12h(shiftStart)} – {formatTime12h(shiftEnd)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              8h paid · Lunch {formatTime12h(lunchStart)}–{formatTime12h(lunchEnd)} · 2×15m breaks
            </p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Assigned Zone</p>
            <p className="mt-1 truncate text-base font-bold text-[#1E1B4B] sm:text-lg">
              {locationName}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Geofence radius: {allowedRadiusMeters}m
            </p>
          </div>
        </div>
      </PwaHeroBanner>

      {/* Main Content Container */}
      <div className="mx-auto w-full max-w-[1440px] space-y-5 px-4 sm:px-6 lg:px-10">
        {/* Clock-In / Clock-Out Command Bar */}
        <section
          ref={attendanceCardRef}
          tabIndex={-1}
          className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4 outline-none focus:ring-2 focus:ring-[#2d2b68]/20"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border max-w-full whitespace-normal break-words leading-normal ${modeBadgeStyle}`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-current animate-pulse" />
                <span>{modeBadgeText}</span>
              </span>

              {activeLog && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <p className="text-xs font-medium text-text-secondary">{elapsedText}</p>
                  {getPunctualityBadge()}
                  {activeBreakType ? (
                    isOverbreakActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 border border-rose-300 tabular-nums font-mono">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                        Overbreak +{formatMmSs(activeOverbreakSeconds)}
                      </span>
                    ) : (
                      <div
                        className={`inline-flex flex-col gap-1 rounded-xl border px-3 py-1.5 ${
                          isOnLunch
                            ? "bg-sky-50 border-sky-200 text-sky-900"
                            : "bg-indigo-50 border-indigo-200 text-indigo-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span>
                            {isOnLunch
                              ? "On Lunch"
                              : `On Break (${Math.min(2, Math.max(1, shortBreaksUsed))}/2)`}
                          </span>
                          <span className="tabular-nums font-mono">
                            {formatMmSs(remainingBreakSeconds)} remaining
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-black/10 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isOnLunch ? "bg-sky-600" : "bg-indigo-600"
                            }`}
                            style={{ width: `${breakProgressPct}%` }}
                          />
                        </div>
                      </div>
                    )
                  ) : (
                    <>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                        2 × 15m breaks · {Math.max(0, 2 - shortBreaksUsed)} left
                      </span>
                      {recordedOverbreak > 0 && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
                          Overbreak +{recordedOverbreak}m
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="w-full sm:w-auto flex flex-wrap justify-start sm:justify-end items-center gap-2">
              {activeLog && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleLunch}
                    disabled={loading || isOnShortBreak}
                    className={`min-h-[40px] w-full sm:w-auto rounded-xl px-3.5 py-2 text-xs font-bold transition-all border disabled:opacity-50 ${
                      isOnLunch
                        ? "bg-sky-600 text-white border-sky-700 hover:bg-sky-700"
                        : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {isOnLunch ? "End Lunch" : "Start Lunch (1 hr)"}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleShortBreak}
                    disabled={loading || isOnLunch || (!isOnShortBreak && shortBreaksUsed >= 2)}
                    className={`min-h-[40px] w-full sm:w-auto rounded-xl px-3.5 py-2 text-xs font-bold transition-all border disabled:opacity-50 ${
                      isOnShortBreak
                        ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                        : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {isOnShortBreak
                      ? `End Break (${shortBreaksUsed}/2)`
                      : shortBreaksUsed >= 2
                        ? "Breaks Used (2/2)"
                        : `15-Min Break (${shortBreaksUsed}/2)`}
                  </button>
                </>
              )}

              {!activeLog ? (
                isWithinUndoWindow ? (
                  <div className="flex flex-col items-start sm:items-end gap-1.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleReopenShift}
                      disabled={loading}
                      className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-amber-700 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">undo</span>
                      {loading
                        ? "Reopening Shift..."
                        : `Reopen Shift (Undo · ${formatMmSs(undoRemainingSeconds)})`}
                    </button>
                    <p className="text-[11px] font-medium text-amber-800">
                      Clocked out by mistake? Undo within 5 minutes to preserve your clock-in.
                    </p>
                  </div>
                ) : isShiftCompletedToday ? (
                  <button
                    type="button"
                    disabled
                    className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[18px]">task_alt</span>
                    Shift Completed Today
                  </button>
                ) : todayApprovedLeave ? (
                  <div className="flex flex-col items-start sm:items-end gap-1 w-full sm:w-auto">
                    <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-100 border border-amber-300 px-5 py-2.5 text-xs sm:text-sm font-bold text-amber-900">
                      <span className="material-symbols-outlined text-[18px]">beach_access</span>
                      Clock-in locked while on approved leave ({todayApprovedLeave.leave_type})
                    </div>
                  </div>
                ) : todayWorkModel === "off" ? (
                  todayApprovedOt ? (
                    <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleClockIn}
                        disabled={loading}
                        className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#1e1b4b] px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">alarm_on</span>
                        {loading ? "Clocking In..." : "Clock In (Approved Overtime)"}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                        <span className="font-semibold text-emerald-700">
                          Approved window: {formatTime12h(todayApprovedOt.start_time.slice(0, 5))} –{" "}
                          {formatTime12h(todayApprovedOt.end_time.slice(0, 5))}
                        </span>
                        <button
                          type="button"
                          disabled={cancellingOtId === todayApprovedOt.id}
                          onClick={() => handleCancelOt(todayApprovedOt.id)}
                          className="font-semibold text-rose-600 hover:underline disabled:opacity-50"
                        >
                          {cancellingOtId === todayApprovedOt.id ? "Cancelling..." : "Cancel Request"}
                        </button>
                      </div>
                    </div>
                  ) : todayPendingOt ? (
                    <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900">
                        <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                        {todayPendingOt.status === "pending_supervisor"
                          ? "Overtime Request Pending Supervisor Approval"
                          : "Overtime Request Pending HR Approval"}
                      </div>
                      <button
                        type="button"
                        disabled={cancellingOtId === todayPendingOt.id}
                        onClick={() => handleCancelOt(todayPendingOt.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {cancellingOtId === todayPendingOt.id ? "Cancelling..." : "Cancel Request"}
                      </button>
                    </div>
                  ) : todayRejectedOt ? (
                    <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
                        <p className="font-bold">Overtime Request Declined</p>
                        {todayRejectedOt.review_note && (
                          <p className="text-[11px]">HR note: {todayRejectedOt.review_note}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openOtModal(todayDateStr)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#2d2b68]"
                      >
                        <span className="material-symbols-outlined text-[16px]">more_time</span>
                        Request Overtime
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <span className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700">
                        Rest Day: OT Requires Approval
                      </span>
                      <button
                        type="button"
                        onClick={() => openOtModal(todayDateStr)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#2d2b68]"
                      >
                        <span className="material-symbols-outlined text-[16px]">more_time</span>
                        Request Overtime
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setWmDate(todayDateStr);
                        setWmMode(todayWorkModel === "onsite" ? "wfh" : "onsite");
                        setWmReason("");
                        setShowWorkModeModal(true);
                      }}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs font-semibold text-[#1E1B4B] hover:bg-indigo-100 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                      Work Mode Change
                    </button>
                    <button
                      type="button"
                      onClick={handleClockIn}
                      disabled={loading}
                      className="min-h-[44px] min-w-[190px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1e1b4b] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#2d2b68] active:scale-[0.98] disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">alarm_on</span>
                      {loading ? "Clocking In..." : "Clock In Now"}
                    </button>
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClockOutModal(true)}
                  disabled={loading}
                  className="min-h-[44px] min-w-[190px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                  {loading ? "Clocking Out..." : "Clock Out"}
                </button>
              )}
            </div>
          </div>

          {localWorkModeRequests.length > 0 && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1E1B4B]">
                Work Mode Change Requests
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {localWorkModeRequests.slice(0, 2).map((wm) => (
                  <div
                    key={wm.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">
                        {wm.request_date} · {wm.requested_mode === "wfh" ? "WFH" : "Onsite"}
                      </span>
                      <p className="truncate text-[11px] text-slate-500">{wm.reason}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        wm.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : wm.status === "rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {wm.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isShiftCompletedToday && todayCompletedLog && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-[#1E1B4B]">Shift Completed Today</p>
                <p className="text-slate-600">
                  Clocked in at {toPhtTimeInput(todayCompletedLog.clock_in, "--:--")} · Clocked out at{" "}
                  {toPhtTimeInput(todayCompletedLog.clock_out, "--:--")}. Need to fix a mistake?
                </p>
              </div>
              {todayCorrection?.status === "pending" ? (
                <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Correction Pending
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    openCorrectionModal({
                      log: todayCompletedLog,
                      defaultType: "Accidental Clock-Out",
                    })
                  }
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 self-start sm:self-center rounded-xl bg-[#1E1B4B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#2d2b68] transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[15px]">edit_calendar</span>
                  Request Attendance Correction
                </button>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              {errorMessage}
            </div>
          )}
      </section>

      {/* =====================================================================
          2-COLUMN GRID: CARD 2 (Location & Geofence) + CARD 3 (Weekly & Requests)
         ===================================================================== */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Workspace Location & Geofence + Separate Recent Attendance Logs Card */}
        <div className="lg:col-span-5 space-y-5 min-w-0">
        {/* CARD 2: Workspace Location & Geofence */}
        <section className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Workspace Location &amp; Geofence
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-800 truncate">
                {zoneSummaryName} • {distancePillText} •{" "}
                {isOnline ? "Online" : "Offline"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMapExpanded((p) => !p)}
              className="min-h-[36px] shrink-0 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-[#1E1B4B] transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">
                {isMapExpanded ? "expand_less" : "map"}
              </span>
              {isMapExpanded ? "Hide Map" : "Expand Map"}
            </button>
          </div>

          {isMapExpanded && (
            <div className="h-52 md:h-60 rounded-2xl overflow-hidden border border-gray-100 relative bg-gray-50">
              {targetOfficeCoords ? (
                <WorkspaceMap
                  targetLocation={{
                    lat: targetOfficeCoords.lat,
                    lng: targetOfficeCoords.lng,
                    label: targetOfficeCoords.name,
                  }}
                  userLocation={userLocation}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <span className="material-symbols-outlined text-[28px] text-amber-600">
                    location_off
                  </span>
                  <p className="text-xs font-semibold text-gray-800">
                    {geofenceError || "Geofence coordinates not configured for your account."}
                  </p>
                  {!isTodayOnsite || workModel === "wfh" || workModel === "hybrid" ? (
                    <Link
                      href="/employee/profile"
                      className="mt-1 inline-flex items-center gap-1 rounded-xl bg-[#1E1B4B] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E1B4B]/90"
                    >
                      Set up WFH Location in Profile →
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <span className="material-symbols-outlined text-[18px] text-[#1e1b4b]">
                wifi
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Network
                </p>
                <p className="font-bold text-gray-800 truncate">
                  {isOnline ? "Connected / Online" : "Offline"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
              <span className="material-symbols-outlined text-[18px] text-[#1e1b4b]">
                location_on
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Proximity
                </p>
                <p className="font-bold text-gray-800 truncate">{distancePillText}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-slate-900">
              {locationName} ({allowedRadiusMeters}m radius)
            </p>
            <p className="text-[11px] text-slate-600 break-words">
              {locationAddress || remoteAddress}
            </p>
            <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-slate-500 font-medium">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              <span>
                Managed by HR. Contact HR to update your designated work location.
              </span>
            </div>
          </div>
        </section>

        {/* SEPARATE CARD: Recent Attendance Logs (Read-only, no redundant request button) */}
        <section className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Recent Attendance Logs
              </p>
              <p className="text-[11px] text-slate-500">
                Your latest clock-in and clock-out entries
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
              {recentLogs.length}
            </span>
          </div>

          {recentLogs.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              No recent attendance logs yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentLogs.slice(0, 7).map((log) => {
                const req = getCorrectionForDateOrLog(log.date, log.id);
                return (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{log.date}</span>
                        {req?.status === "pending" && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            Correction Pending
                          </span>
                        )}
                        {req?.status === "approved" && (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Corrected
                          </span>
                        )}
                        {req?.status === "rejected" && (
                          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            Correction Rejected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        In: {log.clock_in ? toPhtTimeInput(log.clock_in, "--:--") : "—"} ·
                        Out:{" "}
                        {log.clock_out
                          ? toPhtTimeInput(log.clock_out, "--:--")
                          : "In progress"}
                        {log.total_hours != null ? ` · ${log.total_hours}h` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>

        {/* CARD 3: Weekly Schedule & Undertime Requests (lg:col-span-7) */}
        <section className="lg:col-span-7 rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-5 min-w-0">
          {/* Top Half: Personal Weekly Shift Calendar */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                  Personal Weekly Shift Calendar
                </p>
                {isSchedulePublished && (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Published
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary font-medium">{weekRangeLabel}</p>
            </div>

            {/* 7-Day Horizontal Date Selector */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {weekDays.map((day) => {
                const isToday = isTodayPht(day.dateStr) || day.isToday;
                return (
                  <div
                    key={day.dateStr}
                    className={`min-w-0 flex flex-col items-center rounded-xl border py-2 px-0.5 text-center text-[11px] sm:text-xs transition-colors ${
                      isToday
                        ? "bg-[#0F172A] text-white border-[#0F172A] ring-2 ring-[#1E3A8A]/30 shadow-sm"
                        : "bg-slate-50 border-slate-200/80 text-slate-700"
                    }`}
                  >
                    <span className={`font-bold ${isToday ? "text-white" : "text-slate-700"}`}>
                      {day.dayShort}
                    </span>
                    <span
                      className={`mt-0.5 text-[10px] sm:text-[11px] font-bold ${
                        isToday ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {day.dayNumber}
                    </span>
                    <span
                      className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold truncate max-w-full ${
                        isToday
                          ? "bg-white/15 text-white"
                          : day.leaveType
                            ? "bg-amber-100 text-amber-800"
                            : day.isOff
                              ? "bg-slate-200/80 text-slate-600"
                              : day.isOnsite
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {day.leaveType
                        ? "Leave"
                        : day.isOff
                          ? "Off"
                          : day.isOnsite
                            ? "Onsite"
                            : "WFH"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Daily Shift Rows */}
            <div className="space-y-2">
              {weekDays.map((day) => {
                const isToday = isTodayPht(day.dateStr) || day.isToday;
                const utReq = getActiveOrLatestUndertimeForDate(day.dateStr);
                const hasActiveUt =
                  utReq !== null &&
                  ["pending_supervisor", "pending_hr", "approved"].includes(utReq.status);
                const utBadge = utReq ? getUndertimeBadge(utReq) : null;
                const canRequestUndertime =
                  !day.isOff &&
                  !day.leaveType &&
                  !day.isPast &&
                  !(isToday && isShiftCompletedToday) &&
                  !hasActiveUt;

                return (
                  <div
                    key={day.dateStr}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border p-3.5 transition-all ${
                      isToday
                        ? "border-slate-300 border-l-4 border-l-[#0F172A] bg-slate-50/70 shadow-sm"
                        : "border-[#e6e4f0] bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex flex-col items-center justify-center rounded-xl border w-11 h-11 shrink-0 ${
                          isToday
                            ? "bg-[#0F172A] border-[#0F172A] text-white"
                            : "bg-[#f7f6fc] border-[#e6e4f0] text-text-primary"
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            isToday ? "text-sky-200" : "text-text-secondary"
                          }`}
                        >
                          {day.dayShort}
                        </span>
                        <span className="text-sm font-extrabold leading-tight">
                          {day.dayNumber}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-bold text-text-primary">
                            {day.shiftTitle}
                          </p>
                          {!day.isOff && !day.leaveType && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                day.isOnsite
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {day.isOnsite ? "Onsite" : "WFH"}
                            </span>
                          )}
                          {utBadge && utReq?.status !== "cancelled" && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${utBadge.cls}`}
                            >
                              {utBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-text-secondary font-medium">
                          {day.leaveType
                            ? "Approved Leave"
                            : day.isOff
                              ? "Scheduled Rest Day"
                              : day.formattedShiftRange}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canRequestUndertime && (
                        <button
                          type="button"
                          onClick={() =>
                            openUndertimeModal(day.dateStr, day.scheduledOut, true)
                          }
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-[#1E1B4B] hover:bg-indigo-100 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            schedule_send
                          </span>
                          Request Undertime
                        </button>
                      )}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${day.statusStyle}`}
                      >
                        {day.statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      </div>

      {/* =====================================================================
          MODALS (Preserved 100%)
         ===================================================================== */}
      <ApplyUndertimeModal
        isOpen={showUndertimeModal}
        onClose={() => setShowUndertimeModal(false)}
        initialWorkDate={utModalDate}
        scheduledOut={utModalScheduledOut}
        shiftStart={shiftStart}
        hasSupervisor={hasSupervisor}
        availableVlCredits={availableVlCredits}
        lockWorkDate={utLockDate}
        onSubmitted={(created) => {
          setLocalUndertimeRequests((prev) => [created, ...prev]);
          router.refresh();
        }}
      />

      {showClockOutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <span className="material-symbols-outlined text-[22px]">logout</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Confirm Clock Out?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Clocking out ends your shift for the day. If you are only stepping away,
                  please use{" "}
                  <span className="font-semibold text-slate-800">Start Break</span> or{" "}
                  <span className="font-semibold text-slate-800">Start Lunch</span> instead.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClockOutModal(false)}
                disabled={loading}
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Keep Working
              </button>
              <button
                type="button"
                onClick={handleClockOut}
                disabled={loading}
                className="w-full sm:w-auto rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Clocking Out..." : "Yes, Clock Out"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCorrectionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#1E1B4B]">
                  Request Attendance Correction
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  HR will review and apply approved timestamp updates to your attendance log.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCorrectionModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    required
                    value={correctionDate}
                    onChange={(e) => setCorrectionDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correction Type
                  </label>
                  <select
                    value={correctionType}
                    onChange={(e) => setCorrectionType(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none bg-white"
                  >
                    {CORRECTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Requested Clock In
                  </label>
                  <input
                    type="time"
                    required
                    value={correctionClockInTime}
                    onChange={(e) => setCorrectionClockInTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Requested Clock Out
                  </label>
                  <input
                    type="time"
                    value={correctionClockOutTime}
                    onChange={(e) => setCorrectionClockOutTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Explain what happened (e.g., accidentally tapped Clock Out instead of Start Lunch)..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  disabled={submittingCorrection}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCorrection || correctionReason.trim().length < 5}
                  className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                >
                  {submittingCorrection ? "Submitting..." : "Submit Correction Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showWorkModeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#1E1B4B]">
                  Request Work Mode Change
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Send a last-minute WFH or Onsite request to your Direct Supervisor for
                  approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkModeModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitWorkMode} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    min={todayDateStr}
                    value={wmDate}
                    onChange={(e) => setWmDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Requested Mode
                  </label>
                  <select
                    value={wmMode}
                    onChange={(e) => setWmMode(e.target.value as "wfh" | "onsite")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  >
                    <option value="wfh">WFH (Work From Home)</option>
                    <option value="onsite">Onsite (Office Branch)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={wmReason}
                  onChange={(e) => setWmReason(e.target.value)}
                  placeholder="e.g., Heavy flooding / transport disruption preventing onsite commute..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWorkModeModal(false)}
                  disabled={submittingWm}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWm || wmReason.trim().length < 5}
                  className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                >
                  {submittingWm ? "Submitting..." : "Send Request to Supervisor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOtModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[92vw] max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#1E1B4B]">Request Overtime</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Supports Regular OT (1.25x), Rest Day OT (1.30x), and overnight shifts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOtModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitOt} className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3.5 py-2.5 text-xs">
                <span className="font-bold text-[#1E1B4B]">
                  {otWindowPreview.isRestDay
                    ? "Scheduled Rest Day → RDOT (1.30x)"
                    : "Scheduled Workday → Regular OT (1.25x, After Shift)"}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-100">
                  Schedule-Locked
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Date
                </label>
                <input
                  type="date"
                  required
                  min={todayDateStr}
                  value={otWorkDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setOtWorkDate(nextDate);
                    if (nextDate) {
                      const check = validateAndClassifyOvertimeRequest({
                        workDate: nextDate,
                        startTime: otStartTime,
                        endTime: otEndTime,
                        workDays,
                        dailyWorkModes,
                        shiftStart,
                        shiftEnd,
                      });
                      if (check.isRestDay) {
                        setOtStartTime(shiftStart.slice(0, 5) || "08:00");
                        setOtEndTime(shiftEnd.slice(0, 5) || "17:00");
                      } else {
                        const endHm = shiftEnd.slice(0, 5) || "17:00";
                        const [h, m] = endHm.split(":").map(Number);
                        const nextH = String(((Number.isFinite(h) ? h : 17) + 2) % 24).padStart(
                          2,
                          "0"
                        );
                        setOtStartTime(endHm);
                        setOtEndTime(
                          `${nextH}:${String(Number.isFinite(m) ? m : 0).padStart(2, "0")}`
                        );
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={otStartTime}
                    onChange={(e) => setOtStartTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Time {otWindowPreview.crossesMidnight ? "(+1 day)" : ""}
                  </label>
                  <input
                    type="time"
                    required
                    value={otEndTime}
                    onChange={(e) => setOtEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
                  />
                </div>
              </div>

              <div
                className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                  otWindowPreview.valid
                    ? "border-indigo-100 bg-indigo-50/60 text-[#1E1B4B]"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {otWindowPreview.valid
                  ? `Duration: ${otWindowPreview.durationHours} hour${
                      otWindowPreview.durationHours === 1 ? "" : "s"
                    }${
                      otWindowPreview.crossesMidnight
                        ? " (Cross-midnight +1 calendar day)"
                        : ""
                    }`
                  : otWindowPreview.error}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={otReason}
                  onChange={(e) => setOtReason(e.target.value)}
                  placeholder="Describe the coverage or urgent deliverable requiring overtime..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#1E1B4B] focus:outline-none"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOtModal(false)}
                  disabled={submittingOt}
                  className="w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submittingOt ||
                    otReason.trim().length < 5 ||
                    !otWindowPreview.valid
                  }
                  className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                >
                  {submittingOt ? "Submitting..." : "Submit Overtime Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showOutsideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[90vw] min-w-[300px] sm:w-full max-w-md bg-white p-6 rounded-2xl shadow-xl mx-auto space-y-4 z-50 text-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 font-bold">
                ⚠️
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">
                  Outside Designated Work Zone
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  You appear to be outside your designated work zone (
                  {pendingCoords?.distanceKm
                    ? `${pendingCoords.distanceKm} km`
                    : "distance preview"}
                  ). Please enter a brief reason for HR review before clocking in.
                </p>
              </div>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Reason for HR Review <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="e.g., Client meeting onsite, traffic delay, temporary remote setup..."
                  className="w-full block rounded-xl border border-gray-300 p-3 text-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOutsideModal(false);
                    setFlagReason("");
                    setPendingCoords(null);
                  }}
                  className="w-full sm:w-auto block rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !flagReason.trim()}
                  className="w-full sm:w-auto block rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Submitting..." : "Proceed & Clock In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
