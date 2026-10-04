"use client";

import { useState } from "react";
import { updateEmployeeLocationAction } from "./employee-location-actions";
import type { OfficeBranch, EmployeeRemoteResidence, WorkSetup } from "@/lib/types";

interface Props {
  employeeId: string;
  initialWorkMode: WorkSetup | "onsite" | "wfh" | "hybrid";
  initialBranchId: string | null;
  officeBranches: OfficeBranch[];
  remoteResidence: EmployeeRemoteResidence | null;
}

export default function GeofenceControlCard({
  employeeId,
  initialWorkMode,
  initialBranchId,
  officeBranches,
  remoteResidence
}: Props) {
  const [workMode, setWorkMode] = useState<string>(initialWorkMode || "onsite");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    const formData = new FormData(e.currentTarget);
    formData.append("employee_id", employeeId);
    
    try {
      await updateEmployeeLocationAction(formData);
      alert("Location settings updated successfully");
    } catch (err: any) {
      alert(err.message || "Failed to update location settings");
    } finally {
      setIsPending(false);
    }
  }

  const needsBranch = workMode === "onsite" || workMode === "hybrid";
  const needsRemote = workMode === "remote" || workMode === "hybrid" || workMode === "wfh";

  return (
    <div className="rounded-xl border border-border bg-card-bg shadow-sm overflow-hidden">
      <div className="bg-surface-bg px-5 py-4 border-b border-border">
        <h3 className="font-h3 text-lg font-bold text-text-main">
          Work Setup & Geofence Control
        </h3>
        <p className="text-sm text-text-muted mt-1">
          Configure the employee's work arrangement and geofencing parameters for attendance tracking.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-text-main">Work Model</label>
          <select
            name="work_mode"
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote (WFH)</option>
          </select>
        </div>

        {needsBranch && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-main">Assigned Office Branch</label>
            <select
              name="work_location_id"
              defaultValue={initialBranchId || ""}
              required={needsBranch}
              className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled>Select a branch...</option>
              {officeBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.address})</option>
              ))}
            </select>
          </div>
        )}

        {needsRemote && (
          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="text-sm font-semibold text-text-main">Registered Remote Residence</h4>
            
            <div className="space-y-3">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Address</label>
              <textarea
                name="remote_address"
                required={needsRemote}
                defaultValue={remoteResidence?.address || ""}
                rows={2}
                className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Latitude</label>
                <input
                  name="remote_lat"
                  type="number"
                  step="any"
                  required={needsRemote}
                  defaultValue={remoteResidence?.latitude || ""}
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Longitude</label>
                <input
                  name="remote_lng"
                  type="number"
                  step="any"
                  required={needsRemote}
                  defaultValue={remoteResidence?.longitude || ""}
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Geofence Radius (meters)</label>
              <input
                name="remote_radius"
                type="number"
                min={1}
                required={needsRemote}
                defaultValue={remoteResidence?.geofence_radius_meters || 200}
                className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Location Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
