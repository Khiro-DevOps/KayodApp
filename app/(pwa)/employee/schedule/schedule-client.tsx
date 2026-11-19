"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  clockInAction,
  clockOutAction,
  toggleLunchAction,
  toggleShortBreakAction,
  updateLiveAttendanceLocationAction,
} from "./actions";
import WorkspaceMap from "@/components/schedule/workspace-map";

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
  workModel: "onsite" | "wfh" | "hybrid";
  isTodayOnsite: boolean;
  hasOfficeCoordinates: boolean;
  shiftStart: string;
  shiftEnd: string;
  lunchStart?: string;
  lunchEnd?: string;
  initialActiveLog: AttendanceLog | null;
  allowedRadiusMeters?: number;
  targetOfficeCoords: { lat: number; lng: number; name: string } | null;
  geofenceError?: string | null;
  remoteAddress: string;
}

function formatTime12h(timeStr: string) {
  if (!timeStr) return "08:00 AM";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const paddedH = h < 10 ? `0${h}` : `${h}`;
  return `${paddedH}:${mStr || "00"} ${ampm}`;
}

// Calculate distance in km between two lat/lng points using Haversine formula
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal place
}

export default function ScheduleClient({
  employeeId,
  workModel,
  isTodayOnsite,
  hasOfficeCoordinates,
  shiftStart,
  shiftEnd,
  lunchStart = "12:00",
  lunchEnd = "13:00",
  initialActiveLog,
  allowedRadiusMeters = 100,
  targetOfficeCoords,
  geofenceError,
  remoteAddress,
}: ScheduleClientProps) {
  const searchParams = useSearchParams();
  const attendanceCardRef = useRef<HTMLDivElement>(null);
  const [activeLog, setActiveLog] = useState<AttendanceLog | null>(initialActiveLog);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedText, setElapsedText] = useState<string>("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [optimisticBreakStartIso, setOptimisticBreakStartIso] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(
    initialActiveLog?.distance_meters ?? null
  );
  const [isInZone, setIsInZone] = useState<boolean>(
    initialActiveLog ? initialActiveLog.zone_status !== "outside_zone" : true
  );
  const lastSentDistanceRef = useRef<number | null>(initialActiveLog?.distance_meters ?? null);
  const lastSentInZoneRef = useRef<boolean>(
    initialActiveLog ? initialActiveLog.zone_status !== "outside_zone" : true
  );
  const lastSentAtRef = useRef<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Soft-blocking modal state
  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number; accuracy: number; distanceKm: number } | null>(null);

  // Focus/scroll to clock-in card when navigated via Attendance nav item (?view=attendance)
  useEffect(() => {
    if (searchParams.get("view") === "attendance" && attendanceCardRef.current) {
      attendanceCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      attendanceCardRef.current.focus({ preventScroll: true });
    }
  }, [searchParams]);

  // Watch network online/offline status
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

  // Watch user geolocation for Leaflet map & distance pill
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

  // Continuous live geofence tracking while clocked in
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
            calculateDistanceKm(lat, lng, targetOfficeCoords.lat, targetOfficeCoords.lng) * 1000
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

  // Keep live elapsed shift timer running when clocked in
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
    activeLog?.active_break_type === "lunch" || activeLog?.active_break_type === "short_break"
      ? activeLog.active_break_type
      : null;

  // 1000ms countdown tick while on lunch or 15-min short break
  useEffect(() => {
    if (!activeBreakType) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBreakType]);

  // Punctuality status badge
  const getPunctualityBadge = () => {
    if (!activeLog) return null;
    const clockInTime = new Date(activeLog.clock_in);
    const [targetH, targetM] = shiftStart.split(":").map((n) => parseInt(n, 10));

    const scheduledDate = new Date(clockInTime);
    scheduledDate.setHours(Number.isNaN(targetH) ? 8 : targetH, Number.isNaN(targetM) ? 0 : targetM, 0, 0);

    const diffMins = Math.floor((clockInTime.getTime() - scheduledDate.getTime()) / (1000 * 60));

    if (diffMins <= 5) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
          ✓ On Time
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
          ⚠️ Late by {diffMins} mins
        </span>
      );
    }
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
    } else {
      setActiveLog({
        id: res.logId,
        clock_in: new Date().toISOString(),
        clock_out: null,
        status: res.status,
        verification_type: res.location_used,
        distance_meters: res.distanceMeters,
        zone_status: res.zone_status,
        break_status: "active",
      });
      setDistanceMeters(res.distanceMeters);
      setIsInZone(res.zone_status !== "outside_zone");
      lastSentDistanceRef.current = res.distanceMeters;
      lastSentInZoneRef.current = res.zone_status !== "outside_zone";
      lastSentAtRef.current = Date.now();
      setShowOutsideModal(false);
      setFlagReason("");
      setPendingCoords(null);
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

    const res = await clockOutAction(activeLog.id);
    if (!res.success) {
      setErrorMessage(res.error);
    } else {
      setActiveLog(null);
      setElapsedText("");
      setOptimisticBreakStartIso(null);
    }
    setLoading(false);
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

  // Determine Badge State
  let badgeText = "";
  let badgeStyle = "";

  if (!isTodayOnsite || workModel === "wfh") {
    badgeText = "Remote Clock-In Active";
    badgeStyle = "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (hasOfficeCoordinates) {
    badgeText = "On-Site Clock-In Active (Geofence Enforced)";
    badgeStyle = "bg-blue-100 text-blue-800 border-blue-200";
  } else {
    badgeText = "On-Site Clock-In Active (Standard Mode)";
    badgeStyle = "bg-amber-100 text-amber-800 border-amber-200";
  }

  // Calculate distance pill display (hydrated from attendance_logs.distance_meters + live GPS)
  let distancePillText = "In Work Zone";
  if (!targetOfficeCoords) {
    distancePillText =
      !isTodayOnsite || workModel === "wfh"
        ? "Remote geofence unconfigured"
        : "Office geofence unconfigured";
  } else if (distanceMeters !== null) {
    const zoneLabel = isInZone ? "In Zone" : "Outside Zone";
    distancePillText = `${distanceMeters.toLocaleString()}m (${zoneLabel})`;
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

  return (
    <div className="space-y-4">
      {/* Attendance Action Header Card */}
      <div
        ref={attendanceCardRef}
        tabIndex={-1}
        className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4 outline-none focus:ring-2 focus:ring-[#2d2b68]/20"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border max-w-full whitespace-normal break-words leading-normal ${badgeStyle}`}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-current animate-pulse" />
              <span className="min-w-0 flex-1">{badgeText}</span>
            </span>
            <p className="text-[11px] font-medium text-slate-600 pt-1">
              Shift: {formatTime12h(shiftStart)} – {formatTime12h(shiftEnd)} · 8 hrs paid · Lunch: {formatTime12h(lunchStart)} – {formatTime12h(lunchEnd)} (1 hr unpaid) · 2 × 15-min paid breaks
            </p>
            {activeLog && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      1 hr unpaid lunch
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-200">
                      2 × 15m paid breaks · {Math.max(0, 2 - shortBreaksUsed)} left
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

          <div className="w-full sm:w-auto flex flex-wrap justify-center items-center gap-2">
            {activeLog && (
              <>
                <button
                  type="button"
                  onClick={handleToggleLunch}
                  disabled={loading || isOnShortBreak}
                  className={`w-full sm:w-auto rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all border disabled:opacity-50 ${
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
                  className={`w-full sm:w-auto rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all border disabled:opacity-50 ${
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
              <button
                onClick={handleClockIn}
                disabled={loading}
                className="w-auto min-w-[220px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1e1b4b] px-8 py-3 text-base font-medium text-white shadow-md transition-all hover:bg-[#2d2b68] active:scale-[0.98] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">alarm_on</span>
                {loading ? "Clocking In..." : "Clock In Now"}
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                disabled={loading}
                className="w-auto min-w-[220px] inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-8 py-3 text-base font-medium text-white shadow-md transition-all hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                {loading ? "Clocking Out..." : "Clock Out"}
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            {errorMessage}
          </div>
        )}
      </div>

      {/* WORKSPACE LOCATION Card (Stitch Spec) */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
        {/* Section Title */}
        <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          WORKSPACE LOCATION
        </p>

        {/* Map Viewport Container */}
        <div className="h-48 md:h-56 rounded-2xl overflow-hidden border border-gray-100 relative bg-gray-50">
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
            </div>
          )}
        </div>

        {/* Bottom Metrics Pill Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Left Pill (Wi-Fi / Network Status) */}
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <span className="material-symbols-outlined text-[18px] text-[#1e1b4b]">wifi</span>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Network</p>
              <p className="font-bold text-gray-800">{isOnline ? "Connected / Online" : "Offline"}</p>
            </div>
          </div>

          {/* Right Pill (Distance / Work Zone Indicator) */}
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <span className="material-symbols-outlined text-[18px] text-[#1e1b4b]">location_on</span>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Proximity</p>
              <p className="font-bold text-gray-800">{distancePillText}</p>
            </div>
          </div>
        </div>

        {/* Read-Only Address Lock Banner */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">
            Registered Address: <span className="font-bold">{remoteAddress}</span>
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            <span>Managed by HR. Contact your HR administrator to update your designated remote work location.</span>
          </div>
        </div>
      </div>

      {/* Soft-Blocking Outside Zone Modal */}
      {showOutsideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-[90vw] min-w-[300px] sm:w-full max-w-md bg-white p-6 rounded-2xl shadow-xl mx-auto space-y-4 z-50 text-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 font-bold">
                ⚠️
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">Outside Designated Work Zone</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  You appear to be outside your designated work zone ({pendingCoords?.distanceKm ? `${pendingCoords.distanceKm} km` : "distance preview"}). Please enter a brief reason for HR review before clocking in.
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
