import type { ReactNode } from "react";

interface AmbientCanvasProps {
  className?: string;
}

export function AmbientCanvas({ className = "" }: AmbientCanvasProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden bg-gradient-to-b from-[#F6F5FC] via-[#F6F5FC]/60 to-transparent ${className}`}
    >
      <div className="absolute -right-24 -top-44 h-[520px] w-[520px] rounded-full border border-[#1E1B4B]/[0.06]" />
      <div className="absolute -right-6 -top-28 h-[360px] w-[360px] rounded-full border border-[#1E1B4B]/[0.05]" />
      <div className="absolute left-1/3 -top-52 h-[440px] w-[440px] rounded-full border border-[#1E1B4B]/[0.04]" />
    </div>
  );
}

interface PageHeroHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  titleBadge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeroHeader({
  eyebrow,
  title,
  titleBadge,
  subtitle,
  actions,
  className = "",
}: PageHeroHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <span className="mb-2 inline-flex rounded-full bg-[#EDE9F9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1E1B4B]">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-bold tracking-tight text-[#1E1B4B] sm:text-3xl">
          <span>{title}</span>
          {titleBadge}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}

interface GlassStatTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function GlassStatTile({
  icon,
  label,
  value,
  badge,
  subtitle,
  className = "",
}: GlassStatTileProps) {
  return (
    <div
      className={`rounded-3xl border border-indigo-100/80 bg-white/75 p-4 shadow-[0_8px_30px_rgb(30,27,75,0.04)] backdrop-blur-md ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-950">
          {icon}
        </div>
        {badge}
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white/90 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </h3>
        <p className="mt-1 text-2xl font-bold tracking-tight text-[#1E1B4B]">{value}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

interface SolidSurfaceCardProps {
  children: ReactNode;
  className?: string;
}

export function SolidSurfaceCard({ children, className = "" }: SolidSurfaceCardProps) {
  return (
    <div
      className={`rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs ${className}`}
    >
      {children}
    </div>
  );
}
