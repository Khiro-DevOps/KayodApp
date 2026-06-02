"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type PwaVariant = "applicant" | "employee";

const shellConfig: Record<
  PwaVariant,
  {
    label: string;
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
    actionIcon: string;
    accentClass: string;
  }
> = {
  applicant: {
    label: "Applicant Portal",
    title: "Applicant Dashboard",
    description: "Track roles, applications, interviews, and your resume from one place.",
    actionLabel: "Browse Jobs",
    actionHref: "/applicant/jobs",
    actionIcon: "search",
    accentClass: "bg-[#7C7AAC] hover:bg-[#4A4880]",
  },
  employee: {
    label: "Employee Portal",
    title: "Employee Dashboard",
    description: "Review schedules, leave requests, and daily work updates from a dedicated space.",
    actionLabel: "View Schedule",
    actionHref: "/employee/schedules",
    actionIcon: "event_available",
    accentClass: "bg-[#1F6F5B] hover:bg-[#165045]",
  },
};

export default function PwaShell({
  variant,
  children,
}: {
  variant: PwaVariant;
  children: ReactNode;
}) {
  const config = shellConfig[variant];

  return (
    <div className="min-h-screen bg-[#fcf8ff] px-4 py-4 text-[#171542] lg:px-6">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <header className="flex items-start justify-between gap-4 pt-2">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7C7AAC]">
              {config.label}
            </p>
            <h1 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold leading-8 text-on-background">
              {config.title}
            </h1>
            <p className="max-w-2xl text-[14px] leading-[22px] text-outline">
              {config.description}
            </p>
          </div>

          <Link
            href={config.actionHref}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 font-medium text-white transition-colors ${config.accentClass}`}
          >
            <span className="material-symbols-outlined text-[20px]">{config.actionIcon}</span>
            {config.actionLabel}
          </Link>
        </header>

        {children}
      </div>
    </div>
  );
}