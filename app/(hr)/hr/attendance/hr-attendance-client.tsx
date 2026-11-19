"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlassStatTile, PageHeroHeader, SolidSurfaceCard } from "@/components/ui/option-b-surfaces";

// ─── Shared types ─────────────────────────────────────────────────────────────
export type AttendanceRow = {
  id: string;
  employeeName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  workSetup: "onsite" | "wfh" | "hybrid" | "remote" | null;
  workModel?: "onsite" | "wfh" | "off" | null;
  isToday: boolean;
  isLate: boolean;
  lateMinutes: number;
  isAbsent?: boolean;
  breakStatusLabel?:
    | "Working"
    | "On Lunch"
    | "On Break (1/2)"
    | "On Break (2/2)"
    | "Overbreak"
    | "Clocked Out"
    | null;
  overbreakMinutes?: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  distanceMeters: number | null;
  zoneStatus:
    | "onsite_verified"
    | "remote_verified"
    | "outside_zone"
    | "location_unverified";
  flagReason: string | null;
};

type Metrics = {
  presentToday: number;
  lateToday: number;
  outsideZoneFlags: number;
  onLeave: number;
  absentToday: number;
};

type Props = {
  rows: AttendanceRow[];
  metrics: Metrics;
  tenantId?: string | null;
};

// ─── Zone Badge ───────────────────────────────────────────────────────────────
function ZoneBadge({ status }: { status: AttendanceRow["zoneStatus"] }) {
  const map: Record<
    AttendanceRow["zoneStatus"],
    { label: string; cls: string; dot: string }
  > = {
    onsite_verified: {
      label: "In Zone",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      dot: "bg-emerald-500",
    },
    remote_verified: {
      label: "In Zone",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      dot: "bg-emerald-500",
    },
    outside_zone: {
      label: "Outside Zone",
      cls: "bg-rose-50 text-rose-700 border border-rose-200",
      dot: "bg-rose-500",
    },
    location_unverified: {
      label: "Unverified",
      cls: "bg-gray-100 text-gray-600 border border-gray-200",
      dot: "bg-gray-400",
    },
  };

  const { label, cls, dot } = map[status] ?? map["location_unverified"];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Work Model Badge ─────────────────────────────────────────────────────────
function WorkModelBadge({
  workModel,
  workSetup,
}: {
  workModel?: AttendanceRow["workModel"];
  workSetup: AttendanceRow["workSetup"];
}) {
  const effectiveModel =
    workModel ??
    (workSetup === "wfh" || workSetup === "remote" ? "wfh" : workSetup ? "onsite" : null);
  if (!effectiveModel) return <span className="text-text-muted text-xs">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    onsite: { label: "Onsite", cls: "bg-blue-100 text-blue-800" },
    wfh: { label: "WFH", cls: "bg-purple-100 text-purple-800" },
    off: { label: "Off", cls: "bg-slate-100 text-slate-600" },
  };
  const { label, cls } = map[effectiveModel] ?? {
    label: effectiveModel,
    cls: "bg-gray-100 text-gray-700",
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
      >
        {label}
      </span>
      {workSetup === "hybrid" && (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
          Work Setup: Hybrid
        </span>
      )}
    </div>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Avatar({
  name,
  src,
}: {
  name: string;
  src: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-9 w-9 rounded-full object-cover border border-border shrink-0"
      />
    );
  }

  return (
    <div className="h-9 w-9 rounded-full bg-primary-light text-primary-dark font-bold text-sm flex items-center justify-center border border-primary/20 shrink-0">
      {initials || "?"}
    </div>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────
export default function HRAttendanceClient({ rows, metrics, tenantId }: Props) {
  const router = useRouter();
  const hasTodayLogs = rows.some((r) => r.isToday);
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(hasTodayLogs);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("hr-attendance-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_logs",
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    const fallbackInterval = todayOnly
      ? setInterval(() => {
          router.refresh();
        }, 15_000)
      : null;

    return () => {
      if (fallbackInterval) clearInterval(fallbackInterval);
      void supabase.removeChannel(channel);
    };
  }, [router, tenantId, todayOnly]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesToday = !todayOnly || r.isToday;
      const matchesSearch =
        !search ||
        r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        (r.jobTitle ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesFlagged = !flaggedOnly || r.zoneStatus === "outside_zone";

      return matchesToday && matchesSearch && matchesFlagged;
    });
  }, [rows, todayOnly, search, flaggedOnly]);

  const flaggedCount = rows.filter((r) => r.zoneStatus === "outside_zone").length;

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <PageHeroHeader
        eyebrow="Live Operations"
        title="Attendance Operations"
        subtitle="Monitor clock-ins, geofence flags, and zone status — last 30 days"
        actions={
          <div className="flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#1E1B4B] shadow-xs backdrop-blur-md">
            <span className="material-symbols-outlined text-[16px] text-[#1E1B4B]">
              update
            </span>
            Live attendance data
          </div>
        }
      />

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">how_to_reg</span>}
          label="Present Today"
          value={metrics.presentToday}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">schedule</span>}
          label="Late Today"
          value={metrics.lateToday}
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">person_off</span>}
          label="Absent Today"
          value={metrics.absentToday}
          badge={
            metrics.absentToday > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Alert
              </span>
            ) : undefined
          }
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">location_off</span>}
          label="Outside Zone Flags"
          value={metrics.outsideZoneFlags}
          badge={
            metrics.outsideZoneFlags > 0 ? (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                Flagged
              </span>
            ) : undefined
          }
        />
        <GlassStatTile
          icon={<span className="material-symbols-outlined text-[20px]">beach_access</span>}
          label="On Leave"
          value={metrics.onLeave}
        />
      </div>

      {/* ── Filter / Search Bar (Frosted Glass) ──────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-100/80 bg-white/75 p-4 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-text-muted text-[20px]">
            search
          </span>
          <input
            id="attendance-search"
            type="text"
            placeholder="Search employee name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-indigo-100 bg-white pl-10 pr-4 py-2 text-xs font-medium text-text-main outline-none focus:border-[#1E1B4B] transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Today / All (30d) Quick Toggle */}
          <div className="inline-flex rounded-xl border border-border bg-surface-bg p-0.5">
            <button
              type="button"
              onClick={() => setTodayOnly(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                todayOnly
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTodayOnly(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                !todayOnly
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              All (30d)
            </button>
          </div>

          {/* Flagged Toggle */}
          <button
            id="attendance-flagged-toggle"
            type="button"
            onClick={() => setFlaggedOnly((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
              flaggedOnly
                ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm ring-1 ring-rose-300"
                : "border-border bg-surface-bg text-text-muted hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {flaggedOnly ? "filter_alt_off" : "filter_alt"}
            </span>
            {flaggedOnly ? "Showing Flagged Only" : "Show Flagged Only"}
            {flaggedCount > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {flaggedCount > 99 ? "99+" : flaggedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Attendance Log Table ─────────────────────────────────────────────── */}
      <SolidSurfaceCard className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-surface-bg">
            <tr>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Employee
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Date
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Clock In
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Clock Out
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Break / Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Work Model
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Distance (m)
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Zone Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Flag Reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text-main">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-14 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[40px] text-text-muted opacity-40">
                      {flaggedOnly ? "location_off" : "history"}
                    </span>
                    <p className="text-sm font-medium text-text-muted">
                      {flaggedOnly
                        ? "No flagged entries found."
                        : search
                        ? "No attendance logs match your search."
                        : "No attendance logs in the last 30 days."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`group transition-colors hover:bg-surface-bg/60 ${
                    row.zoneStatus === "outside_zone"
                      ? "bg-rose-50/30 hover:bg-rose-50/60"
                      : ""
                  }`}
                >
                  {/* Employee */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.employeeName} src={row.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-text-main whitespace-normal break-words leading-relaxed">
                          {row.employeeName}
                        </p>
                        {row.jobTitle && (
                          <p className="text-[11px] text-text-muted whitespace-normal break-words leading-relaxed">
                            {row.jobTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-text-muted">
                    {row.date}
                  </td>

                  {/* Clock In */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.isAbsent ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                        Absent
                      </span>
                    ) : row.clockIn ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-main">
                          {row.clockIn}
                        </span>
                        {row.isLate ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Late (+{row.lateMinutes}m)
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            On Time
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Clock Out */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.isAbsent ? (
                      <span className="text-text-muted">—</span>
                    ) : row.clockOut ? (
                      <span className="font-medium text-text-main">
                        {row.clockOut}
                      </span>
                    ) : (
                      <span className="text-text-muted italic text-[11px]">
                        In progress
                      </span>
                    )}
                  </td>

                  {/* Break / Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.breakStatusLabel ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                            row.breakStatusLabel === "Working"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.breakStatusLabel === "On Lunch"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : row.breakStatusLabel.startsWith("On Break")
                                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                  : row.breakStatusLabel === "Overbreak"
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.breakStatusLabel}
                        </span>
                        {(row.overbreakMinutes ?? 0) > 0 ? (
                          <span className="text-[10px] font-medium text-amber-700">
                            +{row.overbreakMinutes}m overbreak
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Work Model */}
                  <td className="px-4 py-3.5">
                    <WorkModelBadge workModel={row.workModel} workSetup={row.workSetup} />
                  </td>

                  {/* Distance */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.distanceMeters != null ? (
                      <span
                        className={`font-medium ${
                          row.zoneStatus === "outside_zone"
                            ? "text-rose-600"
                            : "text-text-main"
                        }`}
                      >
                        {Math.round(row.distanceMeters).toLocaleString()}m
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Zone Status Badge */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <ZoneBadge status={row.zoneStatus} />
                  </td>

                  {/* Flag Reason */}
                  <td className="px-4 py-3.5">
                    {row.flagReason ? (
                      <span
                        className="block whitespace-normal break-words text-rose-700 font-medium italic leading-relaxed"
                        title={row.flagReason}
                      >
                        {row.flagReason}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer row count */}
        {filtered.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-[11px] text-text-muted flex items-center justify-between">
            <span>
              Showing{" "}
              <span className="font-semibold text-text-main">
                {filtered.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-text-main">{rows.length}</span>{" "}
              records
            </span>
            {flaggedOnly && (
              <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                <span className="material-symbols-outlined text-[13px]">
                  filter_alt
                </span>
                Flagged filter active
              </span>
            )}
          </div>
        )}
      </SolidSurfaceCard>
    </div>
  );
}
