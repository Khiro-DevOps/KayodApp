"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  employeeId: string;
}

type PunchStatus = "loading" | "clocked_in" | "clocked_out";

export default function PunchBar({ employeeId }: Props) {
  const [status, setStatus]         = useState<PunchStatus>("loading");
  const [lastPunchedAt, setLastPunchedAt] = useState<string | null>(null);
  const [todayHours, setTodayHours] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    const supabase = createClient();

    // Get last punch to determine current state
    const { data: lastLog } = await supabase
      .from("time_logs")
      .select("punch_type, punched_at")
      .eq("employee_id", employeeId)
      .order("punched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastLog) {
      setStatus("clocked_out");
    } else {
      setStatus(lastLog.punch_type === "in" ? "clocked_in" : "clocked_out");
      setLastPunchedAt(lastLog.punched_at);
    }

    // Sum today's hours from clock-out records
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayLogs } = await supabase
      .from("time_logs")
      .select("total_hours")
      .eq("employee_id", employeeId)
      .eq("punch_type", "out")
      .gte("punched_at", todayStart.toISOString());

    const hours = (todayLogs ?? []).reduce(
      (sum, l) => sum + (l.total_hours ?? 0),
      0
    );
    setTodayHours(Math.round(hours * 100) / 100);
  }, [employeeId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handlePunch() {
    setSubmitting(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    // Try to get location (optional)
    let location_data = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      location_data = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch {
      // location is optional, continue without it
    }

    if (status === "clocked_out") {
      // Clock in
      await supabase.from("time_logs").insert({
        employee_id: employeeId,
        punch_type: "in",
        punched_at: now,
        location_data,
      });
    } else {
      // Clock out — find the last clock-in to compute hours
      const { data: lastIn } = await supabase
        .from("time_logs")
        .select("id, punched_at")
        .eq("employee_id", employeeId)
        .eq("punch_type", "in")
        .order("punched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const total_hours = lastIn
        ? (new Date(now).getTime() - new Date(lastIn.punched_at).getTime()) / 3_600_000
        : 0;

      await supabase.from("time_logs").insert({
        employee_id: employeeId,
        punch_type: "out",
        punched_at: now,
        location_data,
        total_hours: Math.round(total_hours * 100) / 100,
        paired_log_id: lastIn?.id ?? null,
      });
    }

    await fetchStatus();
    setSubmitting(false);
  }

  const isClockedIn = status === "clocked_in";
  const isLoading   = status === "loading";

  // Format last punch time
  const lastPunchLabel = lastPunchedAt
    ? new Date(lastPunchedAt).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  if (isLoading) return null;

  return (
    <div
      className={`w-full border-b px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
        isClockedIn
          ? "bg-green-50 border-green-200"
          : "bg-white border-gray-200"
      }`}
    >
      {/* Left — status info */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Live indicator dot */}
        <span
          className={`shrink-0 w-2.5 h-2.5 rounded-full ${
            isClockedIn ? "bg-green-500 animate-pulse" : "bg-gray-300"
          }`}
        />

        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight">
            {isClockedIn ? "Clocked in" : "Clocked out"}
          </p>
          <p className="text-xs text-text-secondary leading-tight mt-0.5">
            {isClockedIn && lastPunchLabel
              ? `Since ${lastPunchLabel}`
              : lastPunchLabel
              ? `Last punch at ${lastPunchLabel}`
              : "No punches today"}
            {todayHours > 0 && (
              <span className="ml-2 text-text-secondary">
                · {todayHours}h today
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Right — punch button */}
      <button
        onClick={handlePunch}
        disabled={submitting}
        className={`shrink-0 px-5 py-2 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isClockedIn
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white"
        }`}
      >
        {submitting
          ? "..."
          : isClockedIn
          ? "Clock Out"
          : "Clock In"}
      </button>
    </div>
  );
}