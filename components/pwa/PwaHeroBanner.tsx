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
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
      <section
        className={`-mx-4 sm:-mx-6 lg:mx-0 mt-0 lg:mt-6 rounded-t-none rounded-b-[2rem] lg:rounded-[2rem] w-auto lg:w-full bg-[#1E1B4B] text-white px-5 sm:px-8 lg:px-10 py-6 sm:py-7 min-h-[195px] flex flex-col justify-center shadow-[0_12px_32px_rgba(30,27,75,0.12)] ${className}`}
      >
        <div
          className={`flex w-full flex-1 flex-col ${
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
    </div>
  );
}
