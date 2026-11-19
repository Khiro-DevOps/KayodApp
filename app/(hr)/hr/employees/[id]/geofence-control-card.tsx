"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateEmployeeLocationAction } from "./employee-location-actions";
import { reviewWfhLocationAction } from "@/app/(pwa)/employee/profile/wfh-actions";
import type { OfficeBranch, EmployeeRemoteResidence, WorkSetup } from "@/lib/types";

const Map = dynamic(() => import("../../settings/branches/branch-map"), { ssr: false });

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
  const router = useRouter();
  const [isReviewPending, startReviewTransition] = useTransition();
  const [workMode, setWorkMode] = useState<string>(initialWorkMode || "onsite");
  const [isPending, setIsPending] = useState(false);
  const [address, setAddress] = useState<string>(remoteResidence?.address ?? "");
  const [latitude, setLatitude] = useState<number>(remoteResidence?.latitude ?? 12.8797);
  const [longitude, setLongitude] = useState<number>(remoteResidence?.longitude ?? 121.774);
  const [radius, setRadius] = useState<number>(remoteResidence?.geofence_radius_meters ?? 200);
  const [search, setSearch] = useState<string>("");
  const [results, setResults] = useState<Array<{ lat: string; lon: string; display_name: string }>>([]);
  const [target, setTarget] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (search.trim().length < 3) {
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/geocode/search?q=${encodeURIComponent(search.trim())}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setResults(data?.data ?? []));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    const formData = new FormData(e.currentTarget);
    formData.append("employee_id", employeeId);

    try {
      await updateEmployeeLocationAction(formData);
      alert("Location settings updated successfully");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update location settings");
    } finally {
      setIsPending(false);
    }
  }

  const needsBranch = workMode === "onsite" || workMode === "hybrid";
  const needsRemote = workMode === "remote" || workMode === "hybrid" || workMode === "wfh";
  const hasPendingWfh = remoteResidence?.approval_status === "pending";

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
          Work Setup & Geofence Control
        </h3>
        <p className="text-sm text-text-muted mt-1">
          Configure the employee&apos;s work arrangement and geofencing parameters for attendance tracking.
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
            {Number(remoteResidence.pending_longitude ?? remoteResidence.longitude).toFixed(6)}
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

            <input type="hidden" name="remote_lat" value={latitude} />
            <input type="hidden" name="remote_lng" value={longitude} />

            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
                Search Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setSearch(nextValue);
                    if (nextValue.trim().length < 3) {
                      setResults([]);
                    }
                  }}
                  placeholder="Search Philippine address"
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {results.length > 0 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card-bg shadow">
                    {results.map((result) => (
                      <button
                        key={`${result.lat}-${result.lon}`}
                        type="button"
                        onClick={() => {
                          const next: [number, number] = [Number(result.lat), Number(result.lon)];
                          setTarget(next);
                          setLatitude(next[0]);
                          setLongitude(next[1]);
                          setAddress(result.display_name);
                          setResults([]);
                          setSearch("");
                        }}
                        className="block w-full border-b border-border px-3 py-2 text-left text-xs text-text-main last:border-0 hover:bg-surface-bg transition-colors"
                      >
                        {result.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="relative h-[280px] overflow-hidden rounded-lg border border-border bg-surface-bg">
              <Map
                latitude={latitude}
                longitude={longitude}
                radius={radius}
                target={target}
                onLocationChange={(lat, lng, nextAddress) => {
                  setLatitude(lat);
                  setLongitude(lng);
                  if (nextAddress) setAddress(nextAddress);
                }}
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Address</label>
              <textarea
                name="remote_address"
                required={needsRemote}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Geofence Radius (meters)</label>
              <input
                name="remote_radius"
                type="number"
                min={1}
                required={needsRemote}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) || 200)}
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
