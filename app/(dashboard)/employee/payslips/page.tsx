import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import Link from "next/link";
import type { Payslip, PayrollPeriod } from "@/lib/types";

export default async function PayslipsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: employee } = await supabase.from("employees").select("*").eq("profile_id", user.id).single();

  const { data: currentPayslip } = await supabase
    .from("payslips")
    .select("*, payroll_periods(*)")
    .eq("employee_id", employee?.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: Payslip | null };

  const { data: historicalPayslips } = await supabase
    .from("payslips")
    .select("*, payroll_periods(*)")
    .eq("employee_id", employee?.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Active Payslip Hero Header */}
      <section className="bg-surface-container-low rounded-[32px] border border-outline-variant p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative overflow-hidden shadow-sm">
        {/* Decorative Background Element */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none"></div>

        <div className="space-y-3 relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-widest text-secondary uppercase">LATEST PAYROLL PERIOD</span>
            <span className="px-4 py-1.5 rounded-full bg-green-100 text-green-700 font-bold text-[10px] tracking-widest uppercase border border-green-200 shadow-sm">
              PAID / DEPOSITED
            </span>
          </div>
          <h1 className="text-[48px] md:text-[56px] font-bold text-primary tracking-tighter leading-none drop-shadow-sm tabular-nums">
            {currentPayslip ? formatCurrency(currentPayslip.net_pay) : "₱24,530.00"}
          </h1>
          <p className="text-sm font-semibold text-on-surface-variant flex items-center gap-2 opacity-80">
            <span className="material-symbols-outlined text-[20px]">calendar_today</span>
            Period: {currentPayslip?.payroll_periods 
              ? `${format(new Date(currentPayslip.payroll_periods.period_start), "MMM d")} – ${format(new Date(currentPayslip.payroll_periods.period_end), "MMM d, yyyy")}`
              : "May 16–31, 2026"}
          </p>
        </div>

        <div className="flex gap-4 relative z-10 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-3 bg-primary text-on-primary px-8 py-5 rounded-2xl font-bold text-sm uppercase tracking-widest hover:brightness-110 hover:shadow-xl active:scale-[0.98] transition-all group">
            <span className="material-symbols-outlined group-hover:translate-y-0.5 transition-transform">download</span>
            Download PDF
          </button>
        </div>
      </section>

      {/* Financial Matrix Summary Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card 1: Gross Earnings */}
        <div className="bg-surface-container-lowest rounded-[32px] border border-outline-variant p-8 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-container/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined">payments</span>
              </div>
              Gross Earnings
            </h2>
          </div>
          <ul className="space-y-6 text-sm">
            {[
              { label: "Basic Salary", value: currentPayslip?.basic_pay ?? 25000 },
              { label: "Overtime (OT)", value: currentPayslip?.overtime_pay ?? 2450 },
              { label: "Holiday Pay", value: 1200 },
              { label: "Allowances", value: currentPayslip?.allowances ?? 1500 },
            ].map((item) => (
              <li key={item.label} className="flex justify-between items-center group/row">
                <span className="text-on-surface-variant font-medium group-hover/row:text-primary transition-colors">{item.label}</span>
                <span className="font-bold text-on-surface tabular-nums">{formatCurrency(item.value)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 pt-8 border-t border-dashed border-outline-variant flex justify-between items-center">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase">TOTAL GROSS</span>
            <span className="text-2xl font-bold text-primary tabular-nums">
              {currentPayslip ? formatCurrency(currentPayslip.gross_pay) : "₱30,150.00"}
            </span>
          </div>
        </div>

        {/* Card 2: Statutory Deductions */}
        <div className="bg-surface-container-lowest rounded-[32px] border border-outline-variant p-8 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error-container/10 flex items-center justify-center text-error group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined">account_balance_wallet</span>
              </div>
              Deductions
            </h2>
          </div>
          <ul className="space-y-6 text-sm">
            {[
              { label: "SSS Contribution", value: currentPayslip?.sss_contribution ?? 1125 },
              { label: "PhilHealth", value: currentPayslip?.philhealth_contrib ?? 625 },
              { label: "Pag-IBIG", value: currentPayslip?.pagibig_contrib ?? 100 },
              { label: "Withholding Tax", value: currentPayslip?.withholding_tax ?? 3770 },
            ].map((item) => (
              <li key={item.label} className="flex justify-between items-center group/row">
                <span className="text-on-surface-variant font-medium group-hover/row:text-error transition-colors">{item.label}</span>
                <span className="font-bold text-on-surface tabular-nums">{formatCurrency(item.value)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 pt-8 border-t border-dashed border-outline-variant flex justify-between items-center">
            <span className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase">TOTAL DEDUCTIONS</span>
            <span className="text-2xl font-bold text-error tabular-nums">
              {currentPayslip ? formatCurrency(currentPayslip.total_deductions) : "₱5,620.00"}
            </span>
          </div>
        </div>
      </section>

      {/* Historical Payslips */}
      <section className="bg-surface-container-lowest rounded-[32px] border border-outline-variant overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/30">
          <h2 className="text-[11px] font-bold text-on-surface-variant tracking-[0.2em] uppercase">PAST PAYSLIPS ARCHIVE</h2>
          <button className="text-secondary font-bold text-[11px] hover:underline uppercase tracking-widest">
            View All History
          </button>
        </div>
        <div className="divide-y divide-outline-variant/40">
          {historicalPayslips?.map((ps: any) => (
            <div key={ps.id} className="flex items-center justify-between px-8 py-6 hover:bg-surface-container-low transition-all cursor-pointer group">
              <div className="flex items-center gap-6">
                <div className="bg-primary/5 p-3 rounded-2xl text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">receipt_long</span>
                </div>
                <div>
                  <p className="text-[15px] font-bold text-on-surface group-hover:text-primary transition-colors">
                    {ps.payroll_periods 
                      ? `${format(new Date(ps.payroll_periods.period_start), "MMMM d")} – ${format(new Date(ps.payroll_periods.period_end), "d, yyyy")}`
                      : "Previous Period"}
                  </p>
                  <p className="text-xs font-semibold text-on-surface-variant opacity-70 mt-0.5">
                    Net Pay: <span className="text-on-surface font-bold">{formatCurrency(ps.net_pay)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="hidden md:inline-flex px-4 py-1 rounded-full bg-green-50 text-green-700 font-bold text-[9px] tracking-widest uppercase border border-green-100">
                  PAID
                </span>
                <button className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center text-outline-variant hover:bg-primary hover:text-white hover:border-primary transition-all group/btn">
                   <span className="material-symbols-outlined text-[20px] group-hover/btn:scale-110 transition-transform">download</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
