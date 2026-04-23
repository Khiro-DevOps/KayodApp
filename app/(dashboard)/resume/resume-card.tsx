"use client";

import { Resume } from "@/lib/types";

interface ResumeCardProps {
  resume: Resume;
  isSelected?: boolean;
  onSelect: (resume: Resume) => void;
}

export default function ResumeCard({
  resume,
  isSelected = false,
  onSelect,
}: ResumeCardProps) {
  return (
    <button
      onClick={() => onSelect(resume)}
      className={`w-full text-left rounded-xl border-2 p-3 transition-all duration-200 ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-surface hover:border-primary/30 hover:shadow-sm"
      }`}
      aria-pressed={isSelected}
      aria-label={`Select resume: ${resume.title}`}
    >
      <p className="truncate text-sm font-medium text-text-primary">
        {resume.title || "Untitled Resume"}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          {new Date(resume.created_at).toLocaleDateString()}
        </p>
        {resume.is_primary && (
          <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Primary
          </span>
        )}
      </div>
    </button>
  );
}
