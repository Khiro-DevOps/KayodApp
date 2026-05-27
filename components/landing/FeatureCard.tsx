"use client";

import React from "react";

type IconProp = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export default function FeatureCard({
  title,
  description,
  Icon,
}: {
  title: string;
  description: string;
  Icon: IconProp;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-slate-600 mt-1">{description}</p>
      </div>
    </div>
  );
}
