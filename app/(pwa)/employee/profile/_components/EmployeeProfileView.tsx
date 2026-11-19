"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Profile, Employee, OfficeBranch, EmployeeRemoteResidence, Department } from "@/lib/types";
import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import { resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";
import WfhResidenceCard from "./WfhResidenceCard";

interface EmployeeProfileViewProps {
  profile: (Profile & { emergency_contact?: string | null; bio?: string | null }) | null;
  employee: (Employee & { departments?: Department | null; office_branches?: OfficeBranch | OfficeBranch[] | null }) | null;
  remoteResidence: EmployeeRemoteResidence | null;
  officeBranch?: OfficeBranch | null;
  linkedJobTitle?: string | null;
  linkedJobDepartment?: string | null;
  linkedWorkMode?: string | null;
  resolvedPosition?: string;
  resolvedDepartment?: string;
  resolvedWorkSetupLabel?: string;
  resolvedAssignedLocation?: string;
}

function calculateProbationDaysRemaining(probationEndDateStr?: string | null): number | null {
  if (!probationEndDateStr) return null;
  const endDate = new Date(probationEndDateStr);
  if (isNaN(endDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatTime12h(timeStr?: string | null) {
  if (!timeStr) return "08:00 AM";
  const [hStr, mStr] = timeStr.split(":");
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const paddedH = h < 10 ? `0${h}` : `${h}`;
  return `${paddedH}:${mStr || "00"} ${ampm}`;
}

export default function EmployeeProfileView({
  profile,
  employee,
  remoteResidence,
  officeBranch,
  linkedJobTitle,
  linkedJobDepartment,
  linkedWorkMode,
  resolvedPosition: resolvedPositionProp,
  resolvedDepartment: resolvedDepartmentProp,
  resolvedWorkSetupLabel: resolvedWorkSetupLabelProp,
  resolvedAssignedLocation: resolvedAssignedLocationProp,
}: EmployeeProfileViewProps) {
  const [phone, setPhone] = useState(profile?.phone || "");
  const [emergencyContact, setEmergencyContact] = useState(
    profile?.emergency_contact || ""
  );
  const [bio, setBio] = useState(profile?.bio || "");
  const [loading, setLoading] = useState(false);

  const handleSubmitPersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || null,
          emergency_contact: emergencyContact.trim() || null,
          bio: bio.trim() || null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "Failed to update profile details");
      } else {
        toast.success("Personal information updated successfully");
      }
    } catch {
      toast.error("An error occurred while saving details");
    } finally {
      setLoading(false);
    }
  };

  const probationDays = calculateProbationDaysRemaining(employee?.probation_end_date);
  const shiftText = employee?.shift_start && employee?.shift_end
    ? `${formatTime12h(employee.shift_start)} – ${formatTime12h(employee.shift_end)}`
    : "08:00 AM – 05:00 PM";

  const assignedBranch =
    officeBranch ??
    (Array.isArray(employee?.office_branches)
      ? employee.office_branches[0]
      : employee?.office_branches);

  const sourceOfTruth = resolveEmployeeSourceOfTruth({
    employee,
    jobPosting: {
      title: linkedJobTitle,
      department: linkedJobDepartment,
      work_setup: linkedWorkMode,
    },
    officeBranch: assignedBranch,
    remoteResidence,
  });

  const workMode = sourceOfTruth.workSetup;
  const workSetupLabel = resolvedWorkSetupLabelProp || sourceOfTruth.workSetupLabel;
  const resolvedPosition = resolvedPositionProp || sourceOfTruth.position;
  const resolvedDepartment = resolvedDepartmentProp || sourceOfTruth.department;
  const assignedLocation = resolvedAssignedLocationProp || sourceOfTruth.assignedLocation;

  const locationHeaderLabel =
    workMode === "wfh" || workMode === "remote"
      ? "Remote Residence"
      : workMode === "hybrid"
        ? `${assignedBranch?.name || "Branch"} + Remote Residence`
        : assignedBranch?.name || "Office Branch";

  const geofenceRadius =
    workMode === "wfh" || workMode === "remote"
      ? remoteResidence?.geofence_radius_meters || 200
      : assignedBranch?.radius_meters || 200;

  return (
    <div className="w-full min-w-0">
      <PwaHeroBanner
        title={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Employee Profile"}
        subtitle={profile?.email ?? ""}
        avatar={
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-xl font-extrabold text-white">
            {profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : "E"}
          </div>
        }
        badge={
          <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/15 px-3.5 py-1 text-xs font-semibold text-white">
            {resolvedPosition} · {resolvedDepartment}
          </span>
        }
      />

      {/* Two-Column Desktop Layout */}
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-10">
        {/* Left (lg:col-span-5): Editable Personal Details */}
        <SolidSurfaceCard className="lg:col-span-5 space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-[#1E1B4B]">Personal Details</h2>
            <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-[#1E1B4B]">
              Editable
            </span>
          </div>

          <form onSubmit={handleSubmitPersonal} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +63 917 123 4567"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Emergency Contact</label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. Maria Santos (Spouse) - 0918 987 6543"
                className="w-full rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-700">Personal Bio / Notes</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief bio or emergency notes..."
                className="w-full rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
              />
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1E1B4B]/90 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? "Saving Details..." : "Save Personal Details"}
              </button>
            </div>
          </form>
        </SolidSurfaceCard>

        {/* Right (lg:col-span-7): HR-Assigned Employment Details & Work/Compensation Summary */}
        <SolidSurfaceCard className="lg:col-span-7 space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-[#1E1B4B]">
              HR-Assigned Employment &amp; Work Parameters
            </h2>
            <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              <span className="material-symbols-outlined text-[13px]">lock</span>
              Managed by HR
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Position</p>
              <p className="mt-0.5 text-sm font-bold text-[#1E1B4B]">{resolvedPosition}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Department</p>
              <p className="mt-0.5 text-sm font-bold text-[#1E1B4B]">{resolvedDepartment}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Employment Status</p>
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                employee?.employment_status === "active"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}>
                {employee?.employment_status || "Active"}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Start Date</p>
              <p className="mt-0.5 text-sm font-bold text-[#1E1B4B]">
                {employee?.start_date ? new Date(employee.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Work Setup</p>
              <span className="mt-1 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-[#1E1B4B]">
                {workSetupLabel}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Assigned Shift</p>
              <p className="mt-0.5 text-sm font-bold text-[#1E1B4B]">{shiftText}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Geofence Radius</p>
              <p className="mt-0.5 text-sm font-bold text-[#1E1B4B]">{geofenceRadius} meters</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
                Assigned Location — {locationHeaderLabel}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">{assignedLocation}</p>
            </div>
          </div>

          {/* Probation Countdown Badge if applicable */}
          {probationDays !== null && probationDays > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-700">hourglass_top</span>
                <div>
                  <p className="font-bold">Probation Period Active</p>
                  <p className="text-[11px] text-amber-800 font-medium">Ends on {new Date(employee!.probation_end_date!).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-600 text-white font-extrabold px-3 py-1 text-xs shadow-xs">
                {probationDays} Days Left
              </span>
            </div>
          )}
        </SolidSurfaceCard>
      </div>

      {["hybrid", "wfh", "remote"].includes(workMode.toLowerCase()) ? (
        <div className="mx-auto w-full max-w-[1440px] px-4 pb-2 sm:px-6 lg:px-10">
          <WfhResidenceCard remoteResidence={remoteResidence} />
        </div>
      ) : null}
    </div>
  );
}
