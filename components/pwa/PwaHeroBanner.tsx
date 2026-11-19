import type { ReactNode } from "react";

interface PwaHeroBannerProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  avatar?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function PwaHeroBanner({
  eyebrow,
  title,
  subtitle,
  avatar,
  badge,
  actions,
  children,
  className = "",
}: PwaHeroBannerProps) {
  return (
    <section
      className={`flex min-h-[210px] w-full flex-col justify-between rounded-b-[2rem] bg-[#1E1B4B] px-4 pt-5 pb-7 text-white shadow-[0_12px_30px_rgba(30,27,75,0.14)] sm:min-h-[225px] sm:px-6 lg:px-10 ${className}`}
    >
      <div
        className={`mx-auto flex w-full max-w-[1440px] flex-1 flex-col ${
          children ? "justify-between" : "justify-center"
        }`}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            {avatar ? <div className="shrink-0">{avatar}</div> : null}
            <div className="min-w-0">
              {eyebrow ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-white/75">{subtitle}</p>
              ) : null}
            </div>
          </div>

          {(badge || actions) ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {badge}
              {actions}
            </div>
          ) : null}
        </div>

        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </section>
  );
}
