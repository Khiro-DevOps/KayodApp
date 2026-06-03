import { createClient } from "@/lib/supabase/server";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { TimeClockModule } from "@/components/employee/time-clock-module";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: employee } = await supabase.from("employees").select("*").eq("profile_id", user.id).single();

  // Fetch this week's schedules
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const { data: schedules } = await supabase
    .from("schedules")
    .select("*")
    .eq("employee_id", employee?.id)
    .gte("shift_start", weekStart.toISOString())
    .lte("shift_start", addDays(weekStart, 6).toISOString())
    .order("shift_start", { ascending: true });

  const days = Array.from({ length: 5 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Column: Interactive Tools */}
        <aside className="md:col-span-5 space-y-6">
          <TimeClockModule />

          {/* Workspace Location Info */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[24px] p-6 shadow-sm group">
            <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant mb-4 uppercase">WORKSPACE LOCATION</h3>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-4 bg-surface-container shadow-inner">
              <img 
                alt="Location Map" 
                className="w-full h-full object-cover opacity-60 grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDq5ACt3WPEqn4_onOLtPgHl5bK9GeMNVzbsBbtTY7NQL6eeSkg-2fLeQEU93fLVcOXjwdCCmaLxVGosgrpGycl4grE8xNWPdFqS2QVk_wMQalD9CjgHAl9_Xe0fXJNI-8dhQ3_TX4LZ-auv3C2-czu4xj9YgIugGzAoa7k-S4MlcMWeFJnyKNbe-XDQfNI-L-0WcTF9Id_haRd2KQA4xqe0IinWxkjFNWE-fnkVkmyhGzdiOlSN7Ftp3wqDrKXByOEmcd5mL4LhLf-" 
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-primary/20 rounded-full animate-pulse absolute"></div>
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg relative z-10 scale-125">
                  <span className="material-symbols-outlined text-white text-[20px] fill-1">location_on</span>
                </div>
              </div>
              <div className="absolute bottom-3 left-3 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/40 shadow-sm">
                <p className="text-[10px] font-bold text-primary uppercase">Main Headquarters</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-center hover:bg-white transition-colors">
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">NETWORK</p>
                <p className="text-sm font-bold text-primary flex items-center justify-center gap-1">
                   <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 
                   Kayod_5G
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-center hover:bg-white transition-colors">
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">PROXIMITY</p>
                <p className="text-sm font-bold text-primary">0.05 km</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Column: Schedule Agenda */}
        <div className="md:col-span-7 space-y-8">
          <section className="bg-surface-container-lowest border border-outline-variant rounded-[32px] overflow-hidden shadow-sm">
            <div className="px-8 py-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/30">
              <h3 className="font-bold text-[12px] tracking-widest text-on-surface-variant uppercase">WEEKLY SHIFT ROSTER</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-full font-bold text-[11px] hover:bg-secondary/20 transition-all uppercase tracking-widest">
                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                {format(new Date(), "MMMM yyyy")}
              </button>
            </div>
            
            <div className="divide-y divide-outline-variant/50">
              {days.map((day) => {
                const isToday = isSameDay(day, new Date());
                const schedule = schedules?.find(s => isSameDay(new Date(s.shift_start), day));
                
                return (
                  <div 
                    key={day.toISOString()} 
                    className={`px-8 py-6 flex items-center justify-between transition-all group cursor-default ${
                      isToday ? "bg-primary-container/10 border-l-[6px] border-primary" : "hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-center gap-8">
                      <div className="text-center w-14">
                        <p className={`text-[10px] font-bold tracking-widest uppercase mb-1 ${isToday ? "text-primary" : "text-on-surface-variant opacity-60"}`}>
                          {format(day, "EEE")}
                        </p>
                        <p className={`text-2xl font-bold font-display ${isToday ? "text-primary scale-110" : "text-black"}`}>
                          {format(day, "dd")}
                        </p>
                      </div>
                      <div className={`h-12 w-[2px] transition-colors ${isToday ? "bg-primary/30" : "bg-outline-variant/50"}`}></div>
                      <div>
                        <p className={`text-[15px] font-bold mb-0.5 ${isToday ? "text-on-surface" : "text-on-surface-variant"}`}>
                          {schedule?.notes || "Standard Office Shift"}
                        </p>
                        <p className={`text-xs font-medium ${isToday ? "text-primary" : "text-on-surface-variant opacity-70"}`}>
                          {isToday && <span className="font-bold uppercase tracking-tighter mr-1.5">Today ·</span>}
                          {schedule ? `${format(new Date(schedule.shift_start), "hh:mm aa")} – ${format(new Date(schedule.shift_end), "hh:mm aa")}` : "09:00 AM – 06:00 PM"}
                        </p>
                      </div>
                    </div>
                    
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-sm ${
                      isToday 
                        ? "bg-secondary text-white ring-4 ring-secondary/10" 
                        : (day < new Date() ? "bg-slate-100 text-slate-500 opacity-60" : "bg-surface-container text-on-surface-variant")
                    }`}>
                      {isToday ? "ACTIVE" : (day < new Date() ? "COMPLETED" : "UPCOMING")}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div className="px-8 py-5 bg-surface-container-low/20 text-center">
              <button className="text-primary font-bold text-[11px] hover:underline uppercase tracking-widest transition-all">
                DOWNLOAD FULL MONTHLY ROSTER (.PDF)
              </button>
            </div>
          </section>

          <div className="bg-primary/5 border border-primary/20 rounded-[32px] p-8 flex items-start gap-6 group hover:bg-primary/10 transition-all">
            <div className="p-4 bg-primary rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[28px]">info</span>
            </div>
            <div>
              <h4 className="text-lg font-bold text-primary mb-2">Shift Preferences</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed opacity-80">
                You have until <span className="font-bold text-on-surface">Friday, 5:00 PM</span> to submit your preferred rest days for the next cut-off period (June 1–15).
              </p>
              <button className="mt-6 px-8 py-2.5 bg-primary text-on-primary rounded-full font-bold text-xs uppercase tracking-widest shadow-md hover:shadow-lg active:scale-95 transition-all">
                MANAGE PREFERENCES
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
