export default function WorkforceChart() {
  const months = [
    { label: "JAN", bars: ["h-12 tier-1 rounded-t-sm", "h-16 tier-2", "h-10 tier-3", "h-8 tier-4 rounded-b-sm"] },
    { label: "FEB", bars: ["h-16 tier-1 rounded-t-sm", "h-14 tier-2", "h-12 tier-3", "h-6 tier-4 rounded-b-sm"] },
    { label: "MAR", bars: ["h-14 tier-1 rounded-t-sm", "h-20 tier-2", "h-8 tier-3", "h-10 tier-4 rounded-b-sm"] },
    { label: "APR", bars: ["h-[72px] tier-1 rounded-t-sm", "h-16 tier-2", "h-14 tier-3", "h-4 tier-4 rounded-b-sm"] },
    { label: "MAY", bars: ["h-20 tier-1 rounded-t-sm", "h-[72px] tier-2", "h-12 tier-3", "h-6 tier-4 rounded-b-sm"] },
    { label: "JUN", bars: ["h-12 tier-1 rounded-t-sm", "h-10 tier-2", "h-20 tier-3", "h-12 tier-4 rounded-b-sm"] },
  ];

  return (
    <div className="rounded-xl border border-card-border bg-white p-5 shadow-[0_4px_12px_rgba(46,37,102,0.05)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-poppins)] text-[22px] font-semibold text-on-background">
            Workforce Health Index
          </h2>
          <p className="mt-1 text-sm text-outline">Aggregated sentiment and engagement data</p>
        </div>
        <select className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-sm font-medium text-secondary outline-none">
          <option>Last 6 Months</option>
          <option>Year to Date</option>
        </select>
      </div>

      <div className="flex h-[280px] items-end justify-between gap-3 px-1 sm:gap-4 sm:px-4">
        {months.map((month) => (
          <div key={month.label} className="group flex flex-1 flex-col items-center gap-2 sm:gap-3">
            <div className="flex w-full flex-col items-center gap-[2px]">
              {month.bars.map((barClass, index) => (
                <div
                  key={`${month.label}-${index}`}
                  className={`w-full bg-primary ${barClass}`}
                />
              ))}
            </div>
            <span className="font-[family-name:var(--font-inter)] text-[11px] font-medium uppercase tracking-[0.06em] text-outline">
              {month.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-outline-variant pt-5">
        <LegendSwatch label="Retention" className="bg-primary tier-1" />
        <LegendSwatch label="Morale" className="bg-primary tier-2" />
        <LegendSwatch label="Feedback Rate" className="bg-primary tier-3" />
        <LegendSwatch label="Absence Rate" className="bg-primary tier-4" />
      </div>
    </div>
  );
}

function LegendSwatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-sm ${className}`} />
      <span className="font-[family-name:var(--font-inter)] text-[11px] font-medium uppercase tracking-[0.06em] text-on-surface">
        {label}
      </span>
    </div>
  );
}