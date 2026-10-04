"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Profile, Employee, OfficeBranch, EmployeeRemoteResidence, Department } from "@/lib/types";

interface EmployeeProfileViewProps {
  profile: Profile | null;
  employee: (Employee & { departments?: Department | null; office_branches?: OfficeBranch | null }) | null;
  remoteResidence: EmployeeRemoteResidence | null;
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
  if (!timeStr) return "09:00 AM";
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
}: EmployeeProfileViewProps) {
  const [phone, setPhone] = useState(profile?.phone || "");
  const [emergencyContact, setEmergencyContact] = useState(
    (profile as any)?.emergency_contact || ""
  );
  const [bio, setBio] = useState((profile as any)?.bio || "");
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

  const workMode = (employee?.work_model as string) || (employee?.work_mode as string) || "onsite";
  const probationDays = calculateProbationDaysRemaining(employee?.probation_end_date);
  const formattedSalary = employee?.base_salary || employee?.salary
    ? `₱${(employee?.base_salary || employee?.salary || 0).toLocaleString("en-PH")}`
    : "₱0";
  const shiftText = employee?.shift_start && employee?.shift_end
    ? `${formatTime12h(employee.shift_start)} – ${formatTime12h(employee.shift_end)}`
    : "08:00 AM – 05:00 PM";

  const assignedBranch = Array.isArray((employee as any)?.office_branches)
    ? (employee as any)?.office_branches[0]
    : (employee as any)?.office_branches;

  const locationName = workMode === "wfh" || workMode === "remote"
    ? "Registered Remote Residence"
    : assignedBranch?.name || "Company Head Office";

  const locationAddress = workMode === "wfh" || workMode === "remote"
    ? remoteResidence?.address || "Registered Remote Residence, Metro Manila"
    : assignedBranch?.address || "Company HQ, Makati City, Metro Manila";

  const geofenceRadius = workMode === "wfh" || workMode === "remote"
    ? remoteResidence?.geofence_radius_meters || 200
    : assignedBranch?.radius_meters || 200;

  return (
    <div className="w-full max-w-xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-5">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 font-sans">
          My Employee Profile
        </h1>
        <p className="mt-1 text-xs text-text-secondary font-medium">
          Manage your personal details and view your HR-assigned work parameters.
        </p>
      </div>

      {/* 1. Personal Information Card */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white font-extrabold text-lg shadow-sm">
              {profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : "E"}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {profile?.first_name} {profile?.last_name}
              </h2>
              <p className="text-xs text-text-secondary font-medium">{profile?.email}</p>
            </div>
          </div>
          <span className="rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 text-[11px] font-bold">
            Personal Details
          </span>
        </div>

        <form onSubmit={handleSubmitPersonal} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +63 917 123 4567"
              className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-xs text-gray-900 outline-none transition-all focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Emergency Contact</label>
            <input
              type="text"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="e.g. Maria Santos (Spouse) - 0918 987 6543"
              className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-xs text-gray-900 outline-none transition-all focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Personal Bio / Notes</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Brief bio or emergency notes..."
              className="w-full rounded-xl border border-[#e6e4f0] bg-[#f7f6fc] px-3.5 py-2.5 text-xs text-gray-900 outline-none transition-all focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-purple-700 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Saving Details..." : "Save Personal Details"}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Employment & Role Details Card */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            Employment Details
          </p>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
            <span className="material-symbols-outlined text-[13px]">lock</span>
            Managed by HR
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Position</p>
            <p className="font-bold text-gray-900">{employee?.job_title || "Team Member"}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Department</p>
            <p className="font-bold text-gray-900">{employee?.departments?.name || "General"}</p>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Status</p>
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              employee?.employment_status === "active"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                : "bg-amber-100 text-amber-800 border border-amber-200"
            }`}>
              {employee?.employment_status || "Active"}
            </span>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">Start Date</p>
            <p className="font-bold text-gray-900">
              {employee?.start_date ? new Date(employee.start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
            </p>
          </div>
        </div>

        {/* Probation Countdown Badge if applicable */}
        {probationDays !== null && probationDays > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
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
      </div>

      {/* 3. Work Location & Geofence Card */}
      <div className="rounded-2xl border border-[#e6e4f0] bg-white p-5 shadow-[0_4px_16px_rgba(39,36,84,0.08)] space-y-4">
        <div className="flex items-center justify-between border-b border-[#e6e4f0] pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            Work Location & Geofence
          </p>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
            <span className="material-symbols-outlined text-[13px]">lock</span>
            Managed by HR
          </span>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary font-medium">Work Setup:</span>
            <span className="font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 capitalize">
              {workMode}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-secondary font-medium">Assigned Location:</span>
            <span className="font-bold text-gray-900">{locationName}</span>
          </div>

          <div className="space-y-0.5 pt-1">
            <span className="text-text-secondary font-medium block">Address:</span>
            <p className="text-gray-800 font-semibold bg-[#f7f6fc] p-2.5 rounded-xl border border-[#e6e4f0]">
              {locationAddress}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-text-secondary font-medium">Geofence Radius:</span>
            <span className="font-bold text-gray-900">{geofenceRadius} meters</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#e6e4f0]">
            <span className="text-text-secondary font-medium">Assigned Shift:</span>
            <span className="font-bold text-gray-900">{shiftText}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-text-secondary font-medium">Compensation:</span>
            <span className="font-bold text-emerald-700">{formattedSalary} / month</span>
          </div>
        </div>
      </div>
    </div>
  );
}
