"use client";

import { useState, useEffect } from "react";
import { clockInAction, clockOutAction, toggleBreakAction } from "./actions";
import WorkspaceMap from "@/components/schedule/workspace-map";

interface AttendanceLog {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  verification_type: string | null;
  break_status?: string | null;
}

interface ScheduleClientProps {
  employeeId: string;
  workModel: "onsite" | "wfh" | "hybrid";
  isTodayOnsite: boolean;
  hasOfficeCoordinates: boolean;
  shiftStart: string;
  shiftEnd: string;
  initialActiveLog: AttendanceLog | null;
  targetOfficeCoords: { lat: number; lng: number; name: string };
  remoteAddress: string;
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
  initialActiveLog,
  targetOfficeCoords,
  remoteAddress,
}: ScheduleClientProps) {
  const [activeLog, setActiveLog] = useState<AttendanceLog | null>(initialActiveLog);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedText, setElapsedText] = useState<string>("");
  const [onBreak, setBreak] = useState<boolean>(initialActiveLog?.break_status === "on_break");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Soft-blocking modal state
  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number; accuracy: number; distanceKm: number } | null>(null);

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
        },
        (err) => {
          console.log("Geolocation error/denied:", err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

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

  // Punctuality status badge
  const getPunctualityBadge = () => {
    if (!activeLog) return null;
    const clockInTime = new Date(activeLog.clock_in);
    const [targetH, targetM] = shiftStart.split(":").map((n) => parseInt(n, 10));

    const scheduledDate = new Date(clockInTime);
    scheduledDate.setHours(targetH || 9, targetM || 0, 0, 0);

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
        break_status: "active",
      });
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

        // Calculate client-side distance preview for UI feedback
        const distKm = calculateDistanceKm(
          lat,
          lng,
          targetOfficeCoords.lat,
          targetOfficeCoords.lng
        );

        const geofenceRadiusKm = 0.2; // 200m

        if (distKm > geofenceRadiusKm && (isTodayOnsite || workModel === "onsite")) {
          // Outside zone - open soft-blocking modal/drawer
          setPendingCoords({ lat, lng, accuracy, distanceKm: distKm });
          setShowOutsideModal(true);
          setLoading(false);
        } else {
          // Inside zone or remote mode
          submitClockInPayload(lat, lng, accuracy);
        }
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
      setBreak(false);
    }
    setLoading(false);
  };

  const handleToggleBreak = async () => {
    if (!activeLog) return;
    const nextBreakState = !onBreak;
    setBreak(nextBreakState);
    await toggleBreakAction(activeLog.id, nextBreakState);
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

  // Calculate distance pill display
  let distancePillText = "In Work Zone";
  if (!isTodayOnsite || workModel === "wfh") {
    distancePillText = "In Work Zone (WFH)";
  } else if (userLocation) {
    const dist = calculateDistanceKm(
      userLocation.lat,
      userLocation.lng,
      targetOfficeCoords.lat,
      targetOfficeCoords.lng
    );
    distancePillText = `${dist} km from office`;
  }

  return (
    <div className="space-y-4">
      {/* Attendance Action Header Card */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border max-w-full whitespace-normal break-words leading-normal ${badgeStyle}`}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-current animate-pulse" />
              <span className="min-w-0 flex-1">{badgeText}</span>
            </span>
            {activeLog && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs font-medium text-text-secondary">{elapsedText}</p>
                {getPunctualityBadge()}
              </div>
            )}
          </div>

          <div className="w-full sm:w-auto flex justify-center items-center gap-2">
            {activeLog && (
              <button
                onClick={handleToggleBreak}
                disabled={loading}
                className={`w-full sm:w-auto rounded-xl px-4 py-2.5 text-xs font-bold transition-all border ${
                  onBreak
                    ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                    : "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200"
                }`}
              >
                {onBreak ? "Resume Work" : "Take Break"}
              </button>
            )}

            {!activeLog ? (
              <button
                onClick={handleClockIn}
                disabled={loading}
                className="w-auto min-w-[220px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-base font-medium text-white shadow-md transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
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
          <WorkspaceMap
            targetLocation={{
              lat: targetOfficeCoords.lat,
              lng: targetOfficeCoords.lng,
              label: targetOfficeCoords.name,
            }}
            userLocation={userLocation}
          />
        </div>

        {/* Bottom Metrics Pill Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Left Pill (Wi-Fi / Network Status) */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-[#f7f6fc] px-3.5 py-2.5 text-xs">
            <span className="material-symbols-outlined text-[18px] text-purple-600">wifi</span>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Network</p>
              <p className="font-bold text-gray-800">{isOnline ? "Connected / Online" : "Offline"}</p>
            </div>
          </div>

          {/* Right Pill (Distance / Work Zone Indicator) */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-[#f7f6fc] px-3.5 py-2.5 text-xs">
            <span className="material-symbols-outlined text-[18px] text-purple-600">location_on</span>
            <div>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Proximity</p>
              <p className="font-bold text-gray-800">{distancePillText}</p>
            </div>
          </div>
        </div>

        {/* Read-Only Address Lock Banner */}
        <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-xs text-purple-900 space-y-1">
          <p className="font-semibold text-purple-950">
            Registered Address: <span className="font-bold">{remoteAddress}</span>
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-purple-700 font-medium">
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
