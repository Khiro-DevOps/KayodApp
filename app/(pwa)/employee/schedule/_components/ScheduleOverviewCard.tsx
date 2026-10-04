"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface ScheduleOverviewCardProps {
  workMode: "onsite" | "hybrid" | "remote" | "wfh";
  shiftStart: string;
  shiftEnd: string;
  workDays: string[];
  assignedLocationName: string;
  assignedLocationAddress: string;
  radiusMeters?: number;
  employeeId?: string;
}

function formatTime12h(timeStr: string) {
  if (!timeStr) return "09:00 AM";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const paddedH = h < 10 ? `0${h}` : `${h}`;
  return `${paddedH}:${mStr || "00"} ${ampm}`;
}

const ALL_WEEKDAYS = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" },
];

export default function ScheduleOverviewCard({
  workMode,
  shiftStart,
  shiftEnd,
  workDays,
  assignedLocationName,
  assignedLocationAddress,
  radiusMeters = 200,
  employeeId,
}: ScheduleOverviewCardProps) {
  const router = useRouter();
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Real-time synchronization using Supabase Realtime channel
  useEffect(() => {
    if (!employeeId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`employee_schedule_${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "employees",
          filter: `id=eq.${employeeId}`,
        },
        () => {
          router.refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employee_remote_residences",
          filter: `employee_id=eq.${employeeId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setIsSubscribed(true);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [employeeId, router]);

  // Normalize work mode badge styles
  const isRemote = workMode === "remote" || workMode === "wfh";
  const isHybrid = workMode === "hybrid";
  const isOnsite = workMode === "onsite";

  let badgeColorClass = "bg-purple-100 text-purple-800 border-purple-200";
  let badgeLabel = "Remote / WFH";

  if (isOnsite) {
    badgeColorClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
    badgeLabel = "Onsite";
  } else if (isHybrid) {
    badgeColorClass = "bg-blue-100 text-blue-800 border-blue-200";
    badgeLabel = "Hybrid";
  }

  const normalizedDays = workDays.map((d) => d.trim().toLowerCase());

  return (
    <div className="w-full rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
      {/* Header with Title and Work Setup Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6e4f0] pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            Assigned Schedule Overview
          </p>
          <p className="text-sm font-bold text-text-primary mt-0.5">
            Active Shift & Work Setup
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSubscribed && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200" title="Real-time HR updates active">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold capitalize ${badgeColorClass}`}
          >
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* Active Shift Window */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f7f6fc] rounded-xl p-3.5 border border-[#e6e4f0]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
            <span className="material-symbols-outlined text-[20px]">schedule</span>
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
              Shift Hours (PHT)
            </p>
            <p className="text-base font-extrabold text-text-primary">
              {formatTime12h(shiftStart)} – {formatTime12h(shiftEnd)}
            </p>
          </div>
        </div>
        <div className="text-xs text-text-secondary font-medium sm:text-right">
          <span className="inline-block rounded-md bg-purple-50 px-2.5 py-1 text-purple-800 font-semibold border border-purple-100">
            Philippine Standard Time (UTC+8)
          </span>
        </div>
      </div>

      {/* Weekly Work Days Interactive Day Pills */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
          Weekly Work Schedule
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {ALL_WEEKDAYS.map((day) => {
            const isWorking = normalizedDays.includes(day.full.toLowerCase()) || normalizedDays.includes(day.short.toLowerCase());
            return (
              <div
                key={day.short}
                className={`flex flex-col items-center justify-center rounded-xl py-2 text-center text-xs transition-all ${
                  isWorking
                    ? "bg-purple-600 text-white font-bold shadow-sm"
                    : "bg-[#f7f6fc] border border-[#e6e4f0] text-text-secondary opacity-60 font-medium"
                }`}
              >
                <span>{day.short}</span>
                <span className="text-[9px] mt-0.5 uppercase tracking-tighter">
                  {isWorking ? "Work" : "Off"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assigned Location */}
      <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3.5 space-y-1">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-950">
          <span className="material-symbols-outlined text-[16px] text-purple-700">place</span>
          <span>{assignedLocationName}</span>
        </div>
        <p className="text-xs text-purple-800 font-medium pl-6">
          {assignedLocationAddress}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-purple-700 font-medium pl-6 pt-1">
          <span className="material-symbols-outlined text-[14px]">radar</span>
          <span>Geofence radius: <strong>{radiusMeters}m</strong></span>
        </div>
      </div>
    </div>
  );
}
