"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { CheckCircle2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  ALLOWED_NEGOTIATION_FIELDS,
  respondToNegotiation,
  sendRevisedOffer,
  submitOfferNegotiation,
  type NegotiationField,
  type OfferNegotiationRow,
} from "@/app/actions/offer-negotiation";

interface NegotiationPanelProps {
  token: string;
  applicationId?: string;
  status: string;
  negotiations?: OfferNegotiationRow[];
  isHR?: boolean;
  signSectionRef: RefObject<HTMLDivElement | null>;
  onAccept?: () => Promise<void>;
  isPreparingSigningSession?: boolean;
  acceptError?: string | null;
}

type DraftNegotiationItem = {
  field: NegotiationField;
  requestedValue: string;
  comment: string;
};

const FIELD_LABELS: Record<string, string> = {
  salary: "Salary",
  start_date: "Start date",
  work_setup: "Work setup",
  probation_days: "Probation days",
  other: "Other",
};

function formatNegotiationValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if ("value" in obj && obj.value !== null && obj.value !== undefined) {
      return String(obj.value);
    }
    if ("counterSalary" in obj && obj.counterSalary !== null && obj.counterSalary !== undefined) {
      return String(obj.counterSalary);
    }
    if ("question" in obj && obj.question !== null && obj.question !== undefined) {
      return String(obj.question);
    }
    return JSON.stringify(raw);
  }
  const str = String(raw).trim();
  return str || "—";
}

function getStatusBadge(status: OfferNegotiationRow["status"]) {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        className: "border-green-200 bg-green-50 text-green-700",
      };
    case "countered":
      return {
        label: "Countered",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    case "pending":
    default:
      return {
        label: "Pending",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function NegotiationPanel({
  token,
  applicationId,
  status,
  negotiations = [],
  isHR = false,
  signSectionRef,
  onAccept,
  isPreparingSigningSession,
  acceptError,
}: NegotiationPanelProps) {
  const router = useRouter();
  const normalizedStatus = status.toLowerCase();

  // Candidate state
  const [items, setItems] = useState<DraftNegotiationItem[]>([
    { field: "salary", requestedValue: "", comment: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HR per-row action state
  const [activeHrAction, setActiveHrAction] = useState<
    Record<string, "counter" | "reject" | null>
  >({});
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [sendingRevised, setSendingRevised] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [hrSuccess, setHrSuccess] = useState<string | null>(null);

  if (isHR) {
    if (!negotiations || negotiations.length === 0) {
      return null;
    }

    const maxRound = negotiations.reduce((max, row) => Math.max(max, row.round ?? 1), 1);
    const latestRoundRequests = negotiations.filter((row) => (row.round ?? 1) === maxRound);
    const hasPending = negotiations.some((row) => row.status === "pending");
    const hasApprovedOrCountered = latestRoundRequests.some(
      (row) => row.status === "approved" || row.status === "countered"
    );
    const canSendRevisedOffer = !hasPending && hasApprovedOrCountered;

    const handleHrRespond = async (
      negotiationId: string,
      decision: "approved" | "rejected" | "countered"
    ) => {
      const counterVal = counterInputs[negotiationId]?.trim() ?? "";
      const commentVal = commentInputs[negotiationId]?.trim() ?? "";

      if (decision === "countered" && !counterVal) {
        setHrError("Enter a counter value before submitting.");
        return;
      }

      setRespondingId(negotiationId);
      setHrError(null);
      setHrSuccess(null);

      try {
        const res = await respondToNegotiation(
          negotiationId,
          decision,
          decision === "countered" ? counterVal : undefined,
          commentVal || undefined
        );

        if (!res.success) {
          setHrError(res.error ?? "Failed to save response");
          return;
        }

        setActiveHrAction((prev) => ({ ...prev, [negotiationId]: null }));
        router.refresh();
      } catch (err) {
        setHrError(err instanceof Error ? err.message : "Failed to save response");
      } finally {
        setRespondingId(null);
      }
    };

    const handleSendRevisedOffer = async () => {
      if (!applicationId) {
        setHrError("Application ID is missing.");
        return;
      }

      setSendingRevised(true);
      setHrError(null);
      setHrSuccess(null);

      try {
        const res = await sendRevisedOffer(applicationId);
        if (!res.success) {
          setHrError(res.error ?? "Failed to send revised offer");
          return;
        }

        setHrSuccess("Revised offer sent to candidate.");
        router.refresh();
      } catch (err) {
        setHrError(err instanceof Error ? err.message : "Failed to send revised offer");
      } finally {
        setSendingRevised(false);
      }
    };

    return (
      <section className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">Negotiation requests</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review each candidate change request and approve, counter, or reject.
          </p>
        </div>

        <div className="space-y-4 p-5">
          {hrError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {hrError}
            </div>
          )}

          {hrSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {hrSuccess}
            </div>
          )}

          <div className="space-y-3">
            {negotiations.map((req) => {
              const badge = getStatusBadge(req.status);
              const mode = activeHrAction[req.id] ?? null;
              const isBusy = respondingId === req.id;

              return (
                <div
                  key={req.id}
                  className="space-y-3 rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {FIELD_LABELS[req.target_field] ?? req.target_field}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">
                        Round {req.round}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-text-secondary">Current value: </span>
                      <span className="font-medium text-text-primary">
                        {formatNegotiationValue(req.current_value)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Requested value: </span>
                      <span className="font-medium text-text-primary">
                        {formatNegotiationValue(req.requested_value)}
                      </span>
                    </div>
                  </div>

                  {req.comments && (
                    <p className="text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">Comment: </span>
                      {req.comments}
                    </p>
                  )}

                  {req.status === "countered" && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      <p>
                        <span className="font-semibold">Counter value: </span>
                        {formatNegotiationValue(req.counter_value)}
                      </p>
                      {req.hr_comment && (
                        <p className="mt-1">
                          <span className="font-semibold">HR comment: </span>
                          {req.hr_comment}
                        </p>
                      )}
                    </div>
                  )}

                  {req.status !== "countered" && req.hr_comment && (
                    <p className="text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">HR comment: </span>
                      {req.hr_comment}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleHrRespond(req.id, "approved")}
                      className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setActiveHrAction((prev) => ({
                          ...prev,
                          [req.id]: prev[req.id] === "counter" ? null : "counter",
                        }))
                      }
                      className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      Counter
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setActiveHrAction((prev) => ({
                          ...prev,
                          [req.id]: prev[req.id] === "reject" ? null : "reject",
                        }))
                      }
                      className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>

                  {mode === "counter" && (
                    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
                      <Field label="Counter value" htmlFor={`counter-val-${req.id}`}>
                        <input
                          id={`counter-val-${req.id}`}
                          type="text"
                          value={counterInputs[req.id] ?? ""}
                          onChange={(e) =>
                            setCounterInputs((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Enter counter value"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-info"
                        />
                      </Field>
                      <Field label="HR comment (optional)" htmlFor={`counter-comment-${req.id}`}>
                        <input
                          id={`counter-comment-${req.id}`}
                          type="text"
                          value={commentInputs[req.id] ?? ""}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Explain counter terms"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-info"
                        />
                      </Field>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleHrRespond(req.id, "countered")}
                        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                      >
                        {isBusy ? "Saving..." : "Save counter"}
                      </button>
                    </div>
                  )}

                  {mode === "reject" && (
                    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
                      <Field label="Comment" htmlFor={`reject-comment-${req.id}`}>
                        <input
                          id={`reject-comment-${req.id}`}
                          type="text"
                          value={commentInputs[req.id] ?? ""}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Reason for rejection"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-info"
                        />
                      </Field>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleHrRespond(req.id, "rejected")}
                        className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isBusy ? "Saving..." : "Confirm reject"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canSendRevisedOffer && (
            <div className="pt-2">
              <button
                type="button"
                disabled={sendingRevised}
                onClick={() => void handleSendRevisedOffer()}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendingRevised ? "Sending revised offer..." : "Send revised offer"}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Candidate view
  const disabled =
    normalizedStatus === "signed" ||
    normalizedStatus === "expired" ||
    normalizedStatus === "declined";
  const isNegotiating = normalizedStatus === "negotiating";
  const isSent = normalizedStatus === "sent";

  const handleAddItem = () => {
    setItems((prev) => [...prev, { field: "salary", requestedValue: "", comment: "" }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (
    index: number,
    key: keyof DraftNegotiationItem,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              [key]: value,
            }
          : item
      )
    );
  };

  const handleSubmitNegotiation = async () => {
    if (!applicationId) {
      setError("Application ID is missing.");
      return;
    }

    const validItems = items.map((item) => ({
      field: item.field,
      requestedValue: item.requestedValue.trim(),
      comment: item.comment.trim() || undefined,
    }));

    if (validItems.length === 0 || validItems.some((item) => !item.requestedValue)) {
      setError("Please provide a requested value for every item.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitOfferNegotiation(applicationId, validItems);
      if (!result.success) {
        setError(result.error ?? "Failed to submit negotiation requests.");
        return;
      }

      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit negotiation requests.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">Respond to the offer</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {isNegotiating
            ? "Your change requests and HR updates are listed below."
            : "Accept the offer below or request changes to specific terms."}
        </p>
      </div>

      <div className="space-y-4 p-5">
        {submitted && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Sent to HR</p>
              <p className="text-sm text-green-700">Your change requests were sent to HR.</p>
            </div>
          </div>
        )}

        {(isNegotiating || negotiations.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Change requests</h3>
            {negotiations.map((req) => {
              const badge = getStatusBadge(req.status);
              return (
                <div
                  key={req.id}
                  className="space-y-2 rounded-xl border border-border bg-background p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">
                        {FIELD_LABELS[req.target_field] ?? req.target_field}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">
                        Round {req.round}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="text-text-secondary">Current: </span>
                      <span className="font-medium text-text-primary">
                        {formatNegotiationValue(req.current_value)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Requested: </span>
                      <span className="font-medium text-text-primary">
                        {formatNegotiationValue(req.requested_value)}
                      </span>
                    </div>
                  </div>

                  {req.comments && (
                    <p className="text-text-secondary">
                      <span className="font-medium text-text-primary">Your comment: </span>
                      {req.comments}
                    </p>
                  )}

                  {req.status === "countered" && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-800">
                      <p>
                        <span className="font-semibold">Counter value: </span>
                        {formatNegotiationValue(req.counter_value)}
                      </p>
                      {req.hr_comment && (
                        <p className="mt-1">
                          <span className="font-semibold">HR comment: </span>
                          {req.hr_comment}
                        </p>
                      )}
                    </div>
                  )}

                  {req.status !== "countered" && req.hr_comment && (
                    <p className="text-text-secondary">
                      <span className="font-medium text-text-primary">HR comment: </span>
                      {req.hr_comment}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isSent && !disabled && !submitted && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => {
                signSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                void onAccept?.();
              }}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-left text-text-primary transition-colors hover:border-info/60 hover:bg-surface"
            >
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-text-secondary">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">Accept this offer as-is</span>
                <span className="block text-sm text-text-secondary">
                  Jump straight to the signing section below.
                </span>
              </span>
            </button>

            {isPreparingSigningSession ? (
              <p className="text-sm text-text-primary">Preparing your signing session...</p>
            ) : acceptError ? (
              <p className="text-sm text-red-600">{acceptError}</p>
            ) : null}

            <div className="space-y-4 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-text-secondary" />
                  <h3 className="text-sm font-semibold text-text-primary">Request changes</h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add field
                </button>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const fieldSelectId = `neg-field-${token}-${idx}`;
                  const requestedValId = `neg-val-${token}-${idx}`;
                  const commentId = `neg-comment-${token}-${idx}`;

                  return (
                    <div
                      key={`${token}-item-${idx}`}
                      className="space-y-3 rounded-lg border border-border bg-surface p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-text-secondary">
                          Item #{idx + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Field" htmlFor={fieldSelectId}>
                          <select
                            id={fieldSelectId}
                            value={item.field}
                            onChange={(e) =>
                              handleItemChange(idx, "field", e.target.value as NegotiationField)
                            }
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-info"
                          >
                            {ALLOWED_NEGOTIATION_FIELDS.map((fieldKey) => (
                              <option key={fieldKey} value={fieldKey}>
                                {FIELD_LABELS[fieldKey] ?? fieldKey}
                              </option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Requested value" htmlFor={requestedValId}>
                          <input
                            id={requestedValId}
                            type="text"
                            value={item.requestedValue}
                            onChange={(e) =>
                              handleItemChange(idx, "requestedValue", e.target.value)
                            }
                            placeholder="Enter requested value"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-info"
                          />
                        </Field>
                      </div>

                      <Field label="Comment (optional)" htmlFor={commentId}>
                        <textarea
                          id={commentId}
                          rows={2}
                          value={item.comment}
                          onChange={(e) => handleItemChange(idx, "comment", e.target.value)}
                          placeholder="Add context for HR..."
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-info"
                        />
                      </Field>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleSubmitNegotiation()}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Request changes"}
              </button>
            </div>
          </div>
        )}

        {disabled && (
          <div className="rounded-md border border-border bg-background p-4 text-sm text-text-secondary">
            This offer is no longer accepting changes.
          </div>
        )}
      </div>
    </section>
  );
}
