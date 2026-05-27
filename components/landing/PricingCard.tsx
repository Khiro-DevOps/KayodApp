"use client";

import Link from "next/link";
import React from "react";
import type { SubscriptionPlan, SubscriptionTier } from "@/lib/subscription-tiers";

export default function PricingCard({
  tier,
  selected = false,
  href,
  onSelect,
  ctaLabel = "Get started",
}: {
  tier: SubscriptionTier;
  selected?: boolean;
  href?: string;
  onSelect?: (plan: SubscriptionPlan) => void;
  ctaLabel?: string;
}) {
  const isInteractive = Boolean(href || onSelect);

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-6 transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-gray-100 bg-white hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
            <p className="mt-2 text-2xl font-bold text-slate-900">{tier.price}</p>
          </div>
          {tier.highlighted && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Recommended
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">{tier.limits}</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-2 w-2 rounded-full bg-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        {href ? (
          <Link
            href={href}
            className="block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            {ctaLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onSelect?.(tier.plan)}
            className={`block w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
              selected
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-900 hover:bg-slate-200"
            } ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
          >
            {selected ? "Selected" : ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
