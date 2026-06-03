import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import Link from "next/link";
import type { LeaveBalance, Payslip, TimeLog, Notification } from "@/lib/types";

export default async function EmployeeDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch real data
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: employee } = await supabase.from("employees").select("*, departments(*)").eq("profile_id", user.id).single();
  
  const { data: leaveBalance } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("employee_id", employee?.id)
    .eq("leave_type", "vacation")
    .single() as { data: LeaveBalance | null };

  const { data: nextPayslip } = await supabase
    .from("payslips")
    .select("*, payroll_periods(*)")
    .eq("employee_id", employee?.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: Payslip | null };

  const { data: recentActivity } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employee?.id)
    .order("filed_at", { ascending: false })
    .limit(3);

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3) as { data: Notification[] | null };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Column: Main Content */}
        <div className="md:col-span-8 space-y-8">
          {/* Metric Counters */}
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
              <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant mb-2 uppercase">LEAVE BALANCE</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-primary group-hover:scale-110 transition-transform inline-block">
                  {leaveBalance?.remaining ?? 0}
                </span>
                <span className="text-sm font-medium text-on-surface-variant">days</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group">
              <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant mb-2 uppercase">NEXT PAYROLL</h3>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-primary">
                  {nextPayslip?.payroll_periods?.pay_date ? format(new Date(nextPayslip.payroll_periods.pay_date), "MMM d") : "June 15"}
                </span>
                <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Estimated</span>
              </div>
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="font-bold text-[11px] tracking-widest text-on-surface-variant mb-4 px-1 uppercase">QUICK ACTIONS</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "File leave", icon: "event_available", href: "/employee/schedule" },
                { label: "View payslip", icon: "payments", href: "/employee/payslips" },
                { label: "My profile", icon: "person", href: "/employee/profile" },
                { label: "Time history", icon: "history", href: "/employee/schedule" },
              ].map((action) => (
                <Link 
                  key={action.label} 
                  href={action.href}
                  className="flex flex-col items-center justify-center gap-3 p-6 bg-surface-container-lowest border border-outline-variant rounded-3xl hover:bg-surface-container transition-all hover:-translate-y-1 group shadow-sm hover:shadow-md"
                >
                  <div className="w-12 h-12 rounded-2xl bg-secondary-container/10 flex items-center justify-center text-secondary group-hover:scale-110 group-hover:bg-secondary group-hover:text-white transition-all">
                    <span className="material-symbols-outlined">{action.icon}</span>
                  </div>
                  <span className="font-bold text-[12px] tracking-tight uppercase text-on-surface-variant group-hover:text-primary">{action.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Schedule & Activity Feed */}
          <section className="space-y-6">
            <div className="bg-primary-container text-on-primary rounded-[24px] p-6 relative overflow-hidden shadow-lg group">
              <div className="relative z-10">
                <h3 className="font-bold text-[11px] tracking-widest text-on-primary-container mb-4 uppercase opacity-80">UPCOMING MEETING</h3>
                <h2 className="text-2xl font-bold mb-2 group-hover:translate-x-1 transition-transform">Q2 Performance Review</h2>
                <div className="flex items-center gap-2 mb-4 opacity-90 text-sm">
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                  <span>Tomorrow, 10:00 AM · Conference Room 3</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-on-primary/10 px-4 py-2 rounded-full border border-on-primary/20 backdrop-blur-sm">
                  <span className="material-symbols-outlined text-[16px]">meeting_room</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">In-Person</span>
                </div>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <span className="material-symbols-outlined text-[160px]">groups</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
                <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant uppercase">RECENT ACTIVITY</h3>
                <button className="text-secondary font-bold text-[11px] hover:underline uppercase tracking-wider">VIEW ALL</button>
              </div>
              <div className="divide-y divide-outline-variant">
                {recentActivity?.map((activity: any) => (
                  <div key={activity.id} className="px-6 py-5 flex items-center justify-between hover:bg-surface-container-low transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined">
                          {activity.leave_type === "vacation" ? "beach_access" : "medical_services"}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm uppercase mb-0.5">{activity.leave_type} leave</p>
                        <p className="text-xs text-on-surface-variant">
                          {format(new Date(activity.start_date), "MMM d")} – {format(new Date(activity.end_date), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                      activity.status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                )) ?? (
                   <div className="px-6 py-10 text-center text-on-surface-variant opacity-60">
                     <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                     <p className="text-sm">No recent activity found</p>
                   </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Notifications & Help */}
        <aside className="md:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant mb-4 uppercase">NOTIFICATIONS</h3>
            <div className="space-y-4">
              {notifications?.map((n) => (
                <div key={n.id} className="flex gap-3 items-start group cursor-pointer">
                   <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 ring-4 ring-primary/10"></div>
                   <div>
                     <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{n.title}</p>
                     <p className="text-xs text-on-surface-variant line-clamp-2">{n.body}</p>
                   </div>
                </div>
              ))}
              <button className="w-full py-2 text-[11px] font-bold text-secondary hover:underline uppercase tracking-widest border-t border-outline-variant pt-4">
                Mark all as read
              </button>
            </div>
          </div>

          <div className="bg-secondary-container text-on-secondary-container rounded-3xl p-6 relative overflow-hidden shadow-lg group">
            <h3 className="text-xl font-bold mb-2 group-hover:translate-x-1 transition-transform">Need Help?</h3>
            <p className="text-sm mb-6 opacity-90 leading-relaxed">Reach out to HR for any discrepancies in your records or payroll concerns.</p>
            <button className="w-full py-4 bg-on-secondary-container text-secondary rounded-xl font-bold uppercase tracking-widest text-xs hover:brightness-110 active:scale-95 transition-all shadow-md">
              CONTACT HR SUPPORT
            </button>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <span className="material-symbols-outlined text-[100px]">help_center</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
