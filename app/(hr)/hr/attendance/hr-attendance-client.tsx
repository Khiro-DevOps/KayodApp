"use client";

import { useState, useMemo } from "react";

// ─── Shared types ─────────────────────────────────────────────────────────────
export type AttendanceRow = {
  id: string;
  employeeName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  workSetup: "onsite" | "wfh" | "hybrid" | "remote" | null;
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
};

type Props = {
  rows: AttendanceRow[];
  metrics: Metrics;
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

// ─── Work Setup Badge ─────────────────────────────────────────────────────────
function SetupBadge({ setup }: { setup: AttendanceRow["workSetup"] }) {
  if (!setup) return <span className="text-text-muted text-xs">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    onsite: { label: "Onsite", cls: "bg-blue-100 text-blue-800" },
    wfh: { label: "WFH", cls: "bg-purple-100 text-purple-800" },
    remote: { label: "Remote", cls: "bg-purple-100 text-purple-800" },
    hybrid: { label: "Hybrid", cls: "bg-amber-100 text-amber-800" },
  };
  const { label, cls } = map[setup] ?? {
    label: setup,
    cls: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
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

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  icon,
  iconBg,
  valueColor,
  accent,
}: {
  label: string;
  value: number;
  icon: string;
  iconBg: string;
  valueColor: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-card-bg p-5 shadow-sm transition-shadow hover:shadow-md ${
        accent ? "ring-1 ring-rose-300" : ""
      }`}
    >
      {/* Soft glow stripe */}
      <div
        className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl opacity-60 ${
          accent ? "bg-gradient-to-r from-rose-400 to-amber-400" : "bg-gradient-to-r from-primary/40 to-primary-light"
        }`}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span
          className={`material-symbols-outlined rounded-xl p-2 text-[20px] ${iconBg}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-3 text-4xl font-extrabold tracking-tight ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────
export default function HRAttendanceClient({ rows, metrics }: Props) {
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        !search ||
        r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        (r.jobTitle ?? "").toLowerCase().includes(search.toLowerCase());

      const matchesFlagged = !flaggedOnly || r.zoneStatus === "outside_zone";

      return matchesSearch && matchesFlagged;
    });
  }, [rows, search, flaggedOnly]);

  const flaggedCount = rows.filter((r) => r.zoneStatus === "outside_zone").length;

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-border pb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            Attendance Operations
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Monitor clock-ins, geofence flags, and zone status — last 30 days
          </p>
        </div>
        <div className="mt-2 sm:mt-0 flex items-center gap-2 text-xs text-text-muted bg-surface-bg border border-border rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-[16px] text-primary">
            update
          </span>
          Live attendance data
        </div>
      </div>

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Present Today"
          value={metrics.presentToday}
          icon="how_to_reg"
          iconBg="bg-emerald-100 text-emerald-700"
          valueColor="text-emerald-700"
        />
        <MetricCard
          label="Late Today"
          value={metrics.lateToday}
          icon="schedule"
          iconBg="bg-amber-100 text-amber-600"
          valueColor="text-amber-600"
        />
        <MetricCard
          label="Outside Zone Flags"
          value={metrics.outsideZoneFlags}
          icon="location_off"
          iconBg="bg-rose-100 text-rose-700"
          valueColor="text-rose-600"
          accent={metrics.outsideZoneFlags > 0}
        />
        <MetricCard
          label="On Leave"
          value={metrics.onLeave}
          icon="beach_access"
          iconBg="bg-sky-100 text-sky-700"
          valueColor="text-sky-700"
        />
      </div>

      {/* ── Filter / Search Bar ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border bg-card-bg p-4 shadow-xs">
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
            className="w-full rounded-xl border border-border bg-surface-bg pl-10 pr-4 py-2 text-xs font-medium text-text-main outline-none focus:border-primary focus:bg-card-bg transition-colors"
          />
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

      {/* ── Attendance Log Table ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card-bg shadow-xs">
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
                Work Setup
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
                  colSpan={8}
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
                    {row.clockIn ? (
                      <span className="font-medium text-text-main">
                        {row.clockIn}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Clock Out */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {row.clockOut ? (
                      <span className="font-medium text-text-main">
                        {row.clockOut}
                      </span>
                    ) : (
                      <span className="text-text-muted italic text-[11px]">
                        In progress
                      </span>
                    )}
                  </td>

                  {/* Work Setup */}
                  <td className="px-4 py-3.5">
                    <SetupBadge setup={row.workSetup} />
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
      </div>
    </div>
  );
}
