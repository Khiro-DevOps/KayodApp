"use client";

import Link from "next/link";
import React from "react";

export default function PricingCard({
  planKey,
  name,
  price,
  bullets,
}: {
  planKey: string;
  name: string;
  price: string;
  bullets: string[];
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-gray-100 p-6">
      <div>
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="mt-2 text-2xl font-bold">{price}</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {bullets.map((b) => (
            <li key={b} className="before:content-['•'] before:mr-2 before:text-emerald-600">
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <Link
          href={`/register?plan=${encodeURIComponent(planKey)}`}
          className="block w-full rounded-md bg-emerald-600 px-4 py-2 text-center text-white hover:bg-emerald-700"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
