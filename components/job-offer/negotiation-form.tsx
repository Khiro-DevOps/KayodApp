"use client";

import type { JobOfferTerms, NegotiationItem } from "@/lib/types";
import { useState } from "react";
import { submitNegotiation } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";
import { X } from "lucide-react";

interface Props {
  offerId: string;
  terms: JobOfferTerms;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NegotiationForm({ offerId, terms, onClose, onSuccess }: Props) {
  const [items, setItems] = useState<Omit<NegotiationItem, "currentValue">[]>([
    { term: "salary", requestedValue: "", reason: "" },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const termOptions = [
    { value: "salary", label: "Salary" },
    { value: "start_date", label: "Start Date" },
    { value: "work_arrangement", label: "Work Arrangement" },
    { value: "benefits", label: "Benefits" },
    { value: "other", label: "Other" },
  ] as const;

  const getTermValue = (termKey: string) => {
    switch (termKey) {
      case "salary":
        return `${terms.currency} ${terms.salary.toLocaleString()}`;
      case "start_date":
        return new Date(terms.startDate).toLocaleDateString();
      case "work_arrangement":
        return terms.workArrangement;
      case "benefits":
        return terms.benefits?.join(", ") || "No benefits";
      default:
        return "-";
    }
  };

  const handleAddItem = () => {
    if (items.length < 3) {
      setItems([
        ...items,
        { term: "other", requestedValue: "", reason: "" },
      ]);
    }
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleUpdateItem = (
    idx: number,
    field: "term" | "requestedValue" | "reason",
    value: string
  ) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const handleSubmit = async () => {
    // Validate
    if (items.some((item) => !item.requestedValue || !item.reason)) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      const fullItems: NegotiationItem[] = items.map((item) => ({
        ...item,
        currentValue: getTermValue(item.term),
      }));

      const result = await submitNegotiation(offerId, fullItems);
      if (result.success) {
        toast.success("Negotiation request submitted!");
        onSuccess();
      } else {
        toast.error(result.error || "Failed to submit negotiation");
      }
    } catch (error) {
      toast.error("An error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-900 uppercase">
          Negotiation Request
        </p>
        <button
          onClick={onClose}
          className="text-blue-600 hover:text-blue-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-2 rounded bg-white p-3">
            {/* Term Selection */}
            <div>
              <label className="text-xs text-text-secondary">Term {idx + 1}</label>
              <select
                value={item.term}
                onChange={(e) =>
                  handleUpdateItem(idx, "term", e.target.value)
                }
                className="w-full rounded border border-border bg-white px-2 py-1 text-xs text-text-primary outline-none focus:border-primary"
              >
                {termOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Value (Read-only) */}
            <div>
              <label className="text-xs text-text-secondary">Current Value</label>
              <div className="rounded border border-border bg-gray-50 px-2 py-1 text-xs text-text-primary font-semibold">
                {getTermValue(item.term)}
              </div>
            </div>

            {/* Requested Value */}
            <div>
              <label className="text-xs text-text-secondary">Requested Value</label>
              <input
                type="text"
                value={item.requestedValue}
                onChange={(e) =>
                  handleUpdateItem(idx, "requestedValue", e.target.value)
                }
                placeholder="e.g., 120,000 or Remote only"
                className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-primary"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="text-xs text-text-secondary">Reason (max 300 chars)</label>
              <textarea
                value={item.reason}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 300);
                  handleUpdateItem(idx, "reason", val);
                }}
                placeholder="Explain your request..."
                rows={2}
                className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-primary resize-none"
              />
              <p className="mt-1 text-xs text-text-secondary text-right">
                {item.reason.length}/300
              </p>
            </div>

            {/* Remove Button */}
            {items.length > 1 && (
              <button
                onClick={() => handleRemoveItem(idx)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove Item
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Item Button */}
      {items.length < 3 && (
        <button
          onClick={handleAddItem}
          className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          + Add Another Item
        </button>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {isLoading ? "Submitting..." : "Submit Request"}
        </button>
        <button
          onClick={onClose}
          disabled={isLoading}
          className="flex-1 rounded border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
