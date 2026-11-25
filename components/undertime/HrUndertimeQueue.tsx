"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { hrReviewUndertimeAction } from "@/app/actions/undertime";
import {
  computeLeaveOffsetDays,
  formatTime12h,
  formatUndertimeTypeLabel,
  type UndertimeDeductionMode,
  type UndertimeStatus,
  type UndertimeType,
} from "@/lib/undertime";

export interface HrUndertimeItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string | null;
  workDate: string;
  undertimeType?: UndertimeType;
  scheduledIn?: string | null;
  scheduledOut: string;
  requestedIn?: string | null;
  requestedOut: string | null;
  undertimeMinutes: number;
  leaveCreditsDeducted?: number;
  reason: string;
  coverageNotes: string | null;
  deductionMode: UndertimeDeductionMode;
  status: UndertimeStatus;
  supervisorActedAt: string | null;
  hrActedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Direct to HR (No Supervisor)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HrUndertimeQueue({
  items,
}: {
  items: HrUndertimeItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingHr = items.filter((i) => i.status === "pending_hr");
  const history = items.filter((i) => i.status !== "pending_hr");

  const handleDecision = (item: HrUndertimeItem, decision: "approve" | "reject") => {
    const rejectionReason = (rejectionReasons[item.id] ?? "").trim();
    if (decision === "reject" && rejectionReason.length < 3) {
      toast.error("Please enter a rejection reason (at least 3 characters).");
      return;
    }

    setProcessingId(item.id);
    startTransition(async () => {
      try {
        const res = await hrReviewUndertimeAction({
          requestId: item.id,
          decision,
          rejectionReason,
        });
        if (!res.success) {
          toast.error(res.error ?? "Failed to verify undertime request.");
          return;
        }
        toast.success(
          res.message ??
            (decision === "approve"
              ? `Verified & logged ${item.employeeName}'s undertime (${item.undertimeMinutes}m).`
              : `Rejected ${item.employeeName}'s undertime request.`)
        );
        router.refresh();
      } finally {
        setProcessingId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1E1B4B]">
            Ready for HR Verification &amp; Payroll Logging ({pendingHr.length})
          </h3>
        </div>

        {pendingHr.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            No undertime requests currently awaiting HR verification.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingHr.map((item) => {
              const busy = isPending && processingId === item.id;
              const effIn = item.requestedIn ?? item.scheduledIn ?? "08:00";
              const effOut = item.requestedOut ?? item.scheduledOut;
              const offsetDays = computeLeaveOffsetDays(item.undertimeMinutes);

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-indigo-200/70 bg-white p-5 shadow-sm space-y-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {item.employeeName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.employeeJobTitle ?? "Employee"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-[#1E1B4B]">
                        {formatUndertimeTypeLabel(item.undertimeType)}
                      </span>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                        {item.undertimeMinutes}m
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        {item.deductionMode === "leave_offset"
                          ? `VL Offset (-${offsetDays.toFixed(2)}d)`
                          : "Payroll Deduction"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Work Date &amp; Effective Window
                      </p>
                      <p className="mt-0.5 font-bold text-slate-900">
                        {item.workDate} · {formatTime12h(effIn)} –{" "}
                        {formatTime12h(effOut)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Supervisor Sign-Off
                      </p>
                      <p className="mt-0.5 font-semibold text-emerald-700">
                        {formatTimestamp(item.supervisorActedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Reason
                      </p>
                      <p className="mt-0.5 text-slate-700 truncate" title={item.reason}>
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  {item.coverageNotes && (
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        Coverage Notes:
                      </span>{" "}
                      {item.coverageNotes}
                    </p>
                  )}

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
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {busy ? "Logging..." : "Verify & Log"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent Undertime History ({history.length})
          </h3>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4">
            {history.slice(0, 15).map((item) => {
              const effIn = item.requestedIn ?? item.scheduledIn ?? "08:00";
              const effOut = item.requestedOut ?? item.scheduledOut;
              const offsetDays =
                item.leaveCreditsDeducted && item.leaveCreditsDeducted > 0
                  ? item.leaveCreditsDeducted
                  : computeLeaveOffsetDays(item.undertimeMinutes);

              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900">
                      {item.employeeName} · {item.workDate} ·{" "}
                      <span className="font-semibold text-[#1E1B4B]">
                        {formatUndertimeTypeLabel(item.undertimeType)}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatTime12h(effIn)} – {formatTime12h(effOut)} (
                      {item.undertimeMinutes}m ·{" "}
                      {item.deductionMode === "leave_offset"
                        ? `VL Offset (-${offsetDays.toFixed(2)}d)`
                        : "Payroll Deduction"}
                      )
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      item.status === "approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : item.status === "pending_supervisor"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {item.status.replace("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
