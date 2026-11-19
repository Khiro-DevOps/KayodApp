"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import LocationPinPicker from "@/components/maps/LocationPinPicker";
import type { EmployeeRemoteResidence } from "@/lib/types";
import { submitWfhLocationAction } from "../wfh-actions";

interface WfhResidenceCardProps {
  remoteResidence: EmployeeRemoteResidence | null;
}

export default function WfhResidenceCard({
  remoteResidence,
}: WfhResidenceCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isActiveApproved =
    Boolean(remoteResidence) &&
    remoteResidence?.is_active !== false &&
    (remoteResidence?.approval_status === "approved" ||
      !remoteResidence?.approval_status);
  const isPendingApproval = remoteResidence?.approval_status === "pending";
  const isRejected = remoteResidence?.approval_status === "rejected";

  const [showRelocationForm, setShowRelocationForm] = useState(false);
  const [address, setAddress] = useState(
    remoteResidence?.pending_address ?? remoteResidence?.address ?? "",
  );
  const [latitude, setLatitude] = useState(
    remoteResidence?.pending_latitude ?? remoteResidence?.latitude ?? 14.5995,
  );
  const [longitude, setLongitude] = useState(
    remoteResidence?.pending_longitude ?? remoteResidence?.longitude ?? 120.9842,
  );
  const [relocationReason, setRelocationReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitWfhLocationAction({
        address,
        latitude,
        longitude,
        relocationReason: isActiveApproved ? relocationReason : undefined,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to submit WFH location");
        return;
      }

      toast.success(
        isActiveApproved
          ? "Relocation request submitted for HR approval"
          : "WFH location submitted for HR approval",
      );
      setShowRelocationForm(false);
      setRelocationReason("");
      router.refresh();
    });
  };

  return (
    <SolidSurfaceCard className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-[#1E1B4B]">
            WFH / Remote Residence Geofence
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Pin your home work address for WFH clock-in verification. Changes require HR approval.
          </p>
        </div>

        {isActiveApproved && !isPendingApproval ? (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            WFH Verified
          </span>
        ) : isPendingApproval ? (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Pending HR Approval
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            To be set
          </span>
        )}
      </div>

      {isRejected && remoteResidence?.rejection_reason ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <p className="font-semibold">Previous submission declined</p>
          <p className="mt-0.5">{remoteResidence.rejection_reason}</p>
        </div>
      ) : null}

      {isActiveApproved ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Active Approved WFH Residence
            </p>
            <p className="mt-1 text-sm font-bold text-[#1E1B4B]">
              {remoteResidence?.address}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Coordinates: {Number(remoteResidence?.latitude).toFixed(6)},{" "}
              {Number(remoteResidence?.longitude).toFixed(6)} · Radius:{" "}
              {remoteResidence?.geofence_radius_meters ?? 200}m
            </p>
          </div>

          {isPendingApproval && remoteResidence?.pending_address ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
              <p className="font-bold">Relocation Request Pending HR Approval</p>
              <p className="mt-1">
                Requested Address: <span className="font-semibold">{remoteResidence.pending_address}</span>
              </p>
              {remoteResidence.relocation_reason ? (
                <p className="mt-0.5">Reason: {remoteResidence.relocation_reason}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-amber-800">
                Your existing approved WFH geofence remains active until HR approves this change.
              </p>
            </div>
          ) : null}

          {!showRelocationForm ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowRelocationForm(true)}
                className="rounded-xl border border-[#1E1B4B]/20 bg-white px-4 py-2 text-xs font-semibold text-[#1E1B4B] transition-colors hover:bg-[#1E1B4B] hover:text-white"
              >
                Request Location Change
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-100 pt-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  Relocation Reason
                </label>
                <input
                  type="text"
                  required
                  value={relocationReason}
                  onChange={(e) => setRelocationReason(e.target.value)}
                  placeholder="e.g. Moving to a new apartment in Makati"
                  className="w-full rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
                />
              </div>

              <LocationPinPicker
                address={address}
                latitude={latitude}
                longitude={longitude}
                radius={200}
                onChange={(next) => {
                  setAddress(next.address);
                  setLatitude(next.latitude);
                  setLongitude(next.longitude);
                }}
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRelocationForm(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E1B4B]/90 disabled:opacity-50"
                >
                  {isPending ? "Submitting..." : "Submit Relocation Request"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {isPendingApproval && remoteResidence?.address ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
              <p className="font-bold">Submitted for HR Approval</p>
              <p className="mt-1">{remoteResidence.address}</p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                You can update your pin below while waiting for HR approval.
              </p>
            </div>
          ) : null}

          <LocationPinPicker
            address={address}
            latitude={latitude}
            longitude={longitude}
            radius={200}
            onChange={(next) => {
              setAddress(next.address);
              setLatitude(next.latitude);
              setLongitude(next.longitude);
            }}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-[#1E1B4B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1E1B4B]/90 disabled:opacity-50"
            >
              {isPending
                ? "Submitting..."
                : "Submit WFH Location for HR Approval"}
            </button>
          </div>
        </form>
      )}
    </SolidSurfaceCard>
  );
}
