"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateEmployeeLocationAction } from "./employee-location-actions";
import { reviewWfhLocationAction } from "@/app/(pwa)/employee/profile/wfh-actions";
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
  remoteResidence,
}: Props) {
  const router = useRouter();
  const [isReviewPending, startReviewTransition] = useTransition();
  const [workMode, setWorkMode] = useState<string>(initialWorkMode || "onsite");
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId || "");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setWorkMode(initialWorkMode || "onsite");
  }, [initialWorkMode]);

  useEffect(() => {
    setSelectedBranchId(initialBranchId || "");
  }, [initialBranchId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    const formData = new FormData(e.currentTarget);
    formData.append("employee_id", employeeId);

    try {
      await updateEmployeeLocationAction(formData);
      toast.success("Location settings updated successfully");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update location settings");
    } finally {
      setIsPending(false);
    }
  }

  const needsBranch = workMode === "onsite" || workMode === "hybrid";
  const needsRemote = workMode === "remote" || workMode === "hybrid" || workMode === "wfh";
  const hasPendingWfh =
    remoteResidence?.approval_status === "pending" ||
    remoteResidence?.pending_latitude != null ||
    (Boolean(remoteResidence) &&
      remoteResidence?.is_active === false &&
      remoteResidence?.approval_status !== "rejected");
  const isApprovedWfh =
    Boolean(remoteResidence) &&
    remoteResidence?.is_active !== false &&
    (remoteResidence?.approval_status === "approved" || !remoteResidence?.approval_status);

  const handleReviewWfh = (decision: "approve" | "reject") => {
    startReviewTransition(async () => {
      const res = await reviewWfhLocationAction({ employeeId, decision });
      if (!res.success) {
        toast.error(res.error || "Failed to review WFH request");
        return;
      }
      toast.success(
        decision === "approve"
          ? "WFH residence location approved"
          : "WFH residence request declined",
      );
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card-bg shadow-sm overflow-hidden">
      <div className="bg-surface-bg px-5 py-4 border-b border-border">
        <h3 className="font-h3 text-lg font-bold text-text-main">
          Work Setup &amp; Geofence Control
        </h3>
        <p className="text-sm text-text-muted mt-1">
          Configure the employee&apos;s work arrangement, assigned office branch, and review employee-submitted WFH geofence requests.
        </p>
      </div>

      {hasPendingWfh && remoteResidence ? (
        <div className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Pending WFH / Relocation Request
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isReviewPending}
                onClick={() => handleReviewWfh("reject")}
                className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={isReviewPending}
                onClick={() => handleReviewWfh("approve")}
                className="rounded-xl bg-[#1E1B4B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1E1B4B]/90 disabled:opacity-50"
              >
                {isReviewPending ? "Saving..." : "Approve WFH Location"}
              </button>
            </div>
          </div>
          <p className="text-xs font-medium text-amber-950">
            Requested Address: {remoteResidence.pending_address ?? remoteResidence.address}
          </p>
          <p className="text-[11px] text-amber-800">
            Coordinates: {Number(remoteResidence.pending_latitude ?? remoteResidence.latitude).toFixed(6)},{" "}
            {Number(remoteResidence.pending_longitude ?? remoteResidence.longitude).toFixed(6)} · Radius:{" "}
            {remoteResidence.pending_radius_meters ??
              (remoteResidence as { radius_meters?: number | null }).radius_meters ??
              remoteResidence.geofence_radius_meters ??
              200}m
          </p>
          {remoteResidence.relocation_reason ? (
            <p className="text-xs text-amber-900">
              Reason: {remoteResidence.relocation_reason}
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-text-main">Work Setup</label>
          <select
            name="work_mode"
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="wfh">WFH</option>
            <option value="remote">Remote</option>
          </select>
        </div>

        {needsBranch && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-main">Assigned Office Branch</label>
            <select
              name="work_location_id"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              required={needsBranch}
              className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled>Select a branch...</option>
              {officeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.address})
                </option>
              ))}
            </select>
          </div>
        )}

        {needsRemote && (
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-text-main">
                Employee-Submitted WFH Residence Geofence
              </h4>
              {isApprovedWfh ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  WFH Verified
                </span>
              ) : hasPendingWfh ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  Pending HR Approval
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  Awaiting employee submission
                </span>
              )}
            </div>

            {isApprovedWfh && remoteResidence ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs space-y-1">
                <p className="font-semibold text-slate-900">{remoteResidence.address}</p>
                <p className="text-slate-600">
                  Coordinates: {Number(remoteResidence.latitude).toFixed(6)},{" "}
                  {Number(remoteResidence.longitude).toFixed(6)} · Radius:{" "}
                  {(remoteResidence as { radius_meters?: number | null }).radius_meters ??
                    remoteResidence.geofence_radius_meters ??
                    200}m
                </p>
              </div>
            ) : !hasPendingWfh ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                Awaiting employee submission. WFH residence coordinates are pinned by the employee on their Profile page and submitted here for HR approval.
              </div>
            ) : null}
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
