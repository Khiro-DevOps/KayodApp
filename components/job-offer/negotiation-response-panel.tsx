"use client";

import type { JobOffer, NegotiationRequest } from "@/lib/types";
import { useState, useEffect } from "react";
import { respondToNegotiation } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface Props {
  offerId: string;
  onClose: () => void;
}

export default function NegotiationResponsePanel({ offerId, onClose }: Props) {
  const [negotiations, setNegotiations] = useState<NegotiationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchNegotiations();
  }, [offerId]);

  const fetchNegotiations = async () => {
    setLoading(true);
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("negotiation_requests")
        .select("*")
        .eq("offer_id", offerId)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });

      if (!error && data) {
        setNegotiations(data);
      }
    } catch (error) {
      console.error("Error fetching negotiations:", error);
      toast.error("Failed to load negotiation requests");
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (
    negotiationId: string,
    itemIdx: number,
    field: "action" | "counterValue" | "notes",
    value: string
  ) => {
    setResponses((prev) => ({
      ...prev,
      [negotiationId]: {
        ...prev[negotiationId],
        [itemIdx]: {
          ...(prev[negotiationId]?.[itemIdx] || {}),
          [field]: value,
        },
      },
    }));
  };

  const handleSubmitResponse = async (negotiationId: string) => {
    const response = responses[negotiationId];
    if (!response || !Object.keys(response).length) {
      toast.error("Please provide a response for all items");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await respondToNegotiation(negotiationId, response);
      if (result.success) {
        toast.success("Negotiation response submitted!");
        fetchNegotiations();
        setResponses((prev) => {
          const updated = { ...prev };
          delete updated[negotiationId];
          return updated;
        });
      } else {
        toast.error(result.error || "Failed to submit response");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">Loading negotiation requests...</p>
      </div>
    );
  }

  if (!negotiations.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">No pending negotiation requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {negotiations.map((negotiation) => (
        <div key={negotiation.id} className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          {/* Header */}
          <div>
            <p className="text-xs text-text-secondary">Negotiation Round {negotiation.round}</p>
            <p className="text-sm font-semibold text-text-primary">
              Submitted{" "}
              {new Date(negotiation.submitted_at).toLocaleDateString()}
            </p>
          </div>

          {/* Items */}
          <div className="space-y-4 border-t border-border pt-4">
            {negotiation.items && negotiation.items.map((item: any, idx: number) => (
              <div key={idx} className="space-y-3 rounded-lg bg-gray-50 p-4">
                {/* Item Title */}
                <p className="text-xs font-semibold text-text-primary uppercase">
                  {item.term.replace("_", " ")}
                </p>

                {/* Current vs Requested */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-text-secondary">Current Value</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {item.currentValue}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Requested Value</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {item.requestedValue}
                    </p>
                  </div>
                </div>

                {/* Reason */}
                {item.reason && (
                  <div>
                    <p className="text-xs text-text-secondary">Reason</p>
                    <p className="text-sm text-text-primary italic">"{item.reason}"</p>
                  </div>
                )}

                {/* HR Response Options */}
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-semibold text-text-secondary">Your Response</p>

                  {/* Action Select */}
                  <div className="flex gap-2">
                    {["approve", "counter", "decline"].map((action) => (
                      <button
                        key={action}
                        onClick={() =>
                          handleResponseChange(
                            negotiation.id,
                            idx,
                            "action",
                            action
                          )
                        }
                        className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
                          responses[negotiation.id]?.[idx]?.action === action
                            ? "bg-primary text-white"
                            : "border border-border bg-white text-text-secondary hover:border-primary"
                        }`}
                      >
                        {action === "approve" && "✓ Approve"}
                        {action === "counter" && "↔ Counter"}
                        {action === "decline" && "✗ Decline"}
                      </button>
                    ))}
                  </div>

                  {/* Counter Value Input */}
                  {responses[negotiation.id]?.[idx]?.action === "counter" && (
                    <input
                      type="text"
                      placeholder="Counter value..."
                      value={
                        responses[negotiation.id]?.[idx]?.counterValue || ""
                      }
                      onChange={(e) =>
                        handleResponseChange(
                          negotiation.id,
                          idx,
                          "counterValue",
                          e.target.value
                        )
                      }
                      className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-primary"
                    />
                  )}

                  {/* Notes */}
                  <textarea
                    placeholder="Add notes (optional)"
                    value={responses[negotiation.id]?.[idx]?.notes || ""}
                    onChange={(e) =>
                      handleResponseChange(
                        negotiation.id,
                        idx,
                        "notes",
                        e.target.value
                      )
                    }
                    rows={2}
                    className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="border-t border-border pt-4">
            <button
              onClick={() => handleSubmitResponse(negotiation.id)}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:bg-gray-300 transition-colors"
            >
              {isSubmitting ? "Submitting..." : "Submit Response"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
