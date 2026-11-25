"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supervisorReviewUndertimeAction } from "@/app/actions/undertime";
import {
  computeLeaveOffsetDays,
  formatTime12h,
  formatUndertimeTypeLabel,
  type UndertimeDeductionMode,
  type UndertimeType,
} from "@/lib/undertime";

export interface SupervisorUndertimeItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeInitials: string;
  employeeJobTitle: string;
  workDate: string;
  undertimeType?: UndertimeType;
  scheduledIn?: string | null;
  scheduledOut: string;
  requestedIn?: string | null;
  requestedOut: string | null;
  undertimeMinutes: number;
  reason: string;
  coverageNotes: string | null;
  deductionMode: UndertimeDeductionMode;
  createdAt: string | null;
}

export default function SupervisorUndertimeQueue({
  items,
}: {
  items: SupervisorUndertimeItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleDecision = (
    item: SupervisorUndertimeItem,
    decision: "approve" | "reject"
  ) => {
    const rejectionReason = (rejectionReasons[item.id] ?? "").trim();
    if (decision === "reject" && rejectionReason.length < 3) {
      toast.error("Please enter a rejection reason (at least 3 characters).");
      return;
    }

    setProcessingId(item.id);
    startTransition(async () => {
      try {
        const res = await supervisorReviewUndertimeAction({
          requestId: item.id,
          decision,
          rejectionReason,
        });
        if (!res.success) {
          toast.error(res.error ?? "Failed to process undertime request.");
          return;
        }
        toast.success(
          decision === "approve"
            ? `Approved ${item.employeeName}'s undertime and forwarded to HR.`
            : `Rejected ${item.employeeName}'s undertime request.`
        );
        router.refresh();
      } finally {
        setProcessingId(null);
      }
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">
          No pending undertime requests
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Direct reports&apos; undertime requests awaiting operational sign-off will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const busy = isPending && processingId === item.id;
        const effIn = item.requestedIn ?? item.scheduledIn ?? "08:00";
        const effOut = item.requestedOut ?? item.scheduledOut;
        const offsetDays = computeLeaveOffsetDays(item.undertimeMinutes);

        return (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-[#1E1B4B]">
                  {item.employeeInitials}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {item.employeeName}
                  </p>
                  <p className="text-xs text-slate-500">{item.employeeJobTitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-[#1E1B4B]">
                  {formatUndertimeTypeLabel(item.undertimeType)}
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  {item.undertimeMinutes}m
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                  {item.workDate}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Effective Work Window
                </p>
                <p className="mt-0.5 font-bold text-slate-900">
                  {formatTime12h(effIn)} – {formatTime12h(effOut)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Deduction Mode
                </p>
                <p className="mt-0.5 font-semibold text-slate-800">
                  {item.deductionMode === "leave_offset"
                    ? `VL Offset (-${offsetDays.toFixed(2)}d)`
                    : "Payroll Deduction"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Stage
                </p>
                <p className="mt-0.5 font-semibold text-amber-700">
                  Operational Review (Step 1)
                </p>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Reason:</span>{" "}
                {item.reason}
              </p>
              {item.coverageNotes && (
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">
                    Coverage / Handover:
                  </span>{" "}
                  {item.coverageNotes}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
              <input
                type="text"
                value={rejectionReasons[item.id] ?? ""}
                onChange={(e) =>
                  setRejectionReasons((prev) => ({
                    ...prev,
                    [item.id]: e.target.value,
                  }))
                }
                placeholder="Rejection reason (required if rejecting)..."
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecision(item, "reject")}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecision(item, "approve")}
                  className="rounded-xl bg-[#1E1B4B] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#2d2b68] disabled:opacity-50 transition-colors"
                >
                  {busy ? "Processing..." : "Approve → Forward to HR"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
