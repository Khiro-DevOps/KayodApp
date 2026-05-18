import type { ReactNode } from "react";

interface ApplicantContractCardProps {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  avatarUrl?: string | null;
  badge?: ReactNode;
}

export default function ApplicantContractCard({
  candidateName,
  candidateEmail,
  jobTitle,
  avatarUrl,
  badge,
}: ApplicantContractCardProps) {
  const initials = candidateName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={candidateName}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text-primary">{candidateName}</p>
              <p className="truncate text-sm text-text-secondary">{candidateEmail}</p>
            </div>
            {badge}
          </div>
          <p className="mt-2 text-sm text-text-secondary">{jobTitle}</p>
        </div>
      </div>
    </div>
  );
}