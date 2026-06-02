import { createClient } from "@/lib/supabase/server";
import type { Employee, Profile as UserProfile } from "@/lib/types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: employee } = await supabase.from("employees").select("*, departments(*)").eq("profile_id", user.id).single();

  const userInitials = `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (Identity & Controls) */}
        <div className="md:col-span-4 space-y-8">
          {/* Avatar Hero Card */}
          <div className="bg-white border border-outline-variant rounded-[32px] p-8 text-center shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            {/* Signature Geometric Stripe */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-secondary"></div>
            
            <div className="flex justify-center mb-6 relative">
              <div className="w-28 h-28 rounded-full bg-primary/5 flex items-center justify-center p-1.5 border-4 border-white shadow-xl group-hover:rotate-6 transition-transform">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-primary flex items-center justify-center text-white font-bold text-4xl">
                    {userInitials}
                  </div>
                )}
              </div>
              <button className="absolute bottom-1 right-1/2 translate-x-12 w-8 h-8 bg-secondary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[18px]">photo_camera</span>
              </button>
            </div>

            <h2 className="text-2xl font-bold text-primary mb-1">{profile?.first_name} {profile?.last_name}</h2>
            <p className="text-sm font-semibold text-on-surface-variant opacity-70 mb-6 uppercase tracking-[0.1em]">
              {employee?.job_title ?? "Team Member"}
            </p>
            
            <div className="flex flex-wrap justify-center gap-3">
              <span className="px-4 py-1.5 bg-surface-container text-primary font-bold text-[10px] tracking-widest rounded-full border border-primary/10 uppercase">
                {employee?.employee_number ?? "EMP-XXXX"}
              </span>
              <span className="px-4 py-1.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] tracking-widest rounded-full border border-emerald-200 uppercase">
                {employee?.employment_status ?? "ACTIVE"}
              </span>
            </div>
          </div>

          {/* Preferences Card */}
          <div className="bg-white border border-outline-variant rounded-[32px] p-8 shadow-sm">
            <h3 className="text-[11px] font-bold text-primary mb-8 tracking-[0.2em] uppercase border-l-4 border-primary pl-4">PREFERENCES</h3>
            <div className="space-y-6">
              {[
                { label: "Email Notifications", active: true },
                { label: "Push Reminders", active: false },
                { label: "Slack Integration", active: true },
              ].map((pref) => (
                <div key={pref.label} className="flex items-center justify-between group">
                  <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{pref.label}</span>
                  <button className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${pref.active ? "bg-primary" : "bg-outline-variant"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${pref.active ? "translate-x-6" : "translate-x-1"}`}></span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4">
            <button className="w-full flex items-center justify-center gap-3 border-2 border-primary text-primary font-bold text-sm uppercase tracking-widest px-8 py-5 rounded-2xl hover:bg-primary/5 transition-all active:scale-[0.98]">
              <span className="material-symbols-outlined text-[20px]">lock_reset</span>
              Change Password
            </button>
            <button className="w-full flex items-center justify-center gap-3 bg-error-container/20 text-error font-bold text-sm uppercase tracking-widest px-8 py-5 rounded-2xl hover:bg-error-container/40 transition-all active:scale-[0.98] border border-error/10">
              <span className="material-symbols-outlined text-[20px]">logout</span>
              Sign Out Account
            </button>
          </div>
        </div>

        {/* Right Column (Core Data) */}
        <div className="md:col-span-8 space-y-8">
          
          {/* Employment Details */}
          <div className="bg-white border border-outline-variant rounded-[32px] p-10 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <span className="material-symbols-outlined fill-1">business_center</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface">Employment Details</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-10 gap-x-12">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">DEPARTMENT</p>
                <p className="text-base text-on-surface font-bold">{employee?.departments?.name ?? "Engineering"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">EMPLOYMENT TYPE</p>
                <p className="text-base text-on-surface font-bold">{employee?.employment_type?.replace('_', ' ') ?? "Regular Full-Time"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">DATE HIRED</p>
                <p className="text-base text-on-surface font-bold">March 15, 2023</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">REPORTS TO</p>
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container text-xs font-bold uppercase tracking-tighter">MS</div>
                   <p className="text-base text-primary font-bold">Maria Santos</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white border border-outline-variant rounded-[32px] p-10 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <span className="material-symbols-outlined fill-1">contact_page</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface">Contact Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-10 gap-x-12">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">WORK EMAIL</p>
                <p className="text-base text-primary font-bold underline decoration-primary/30 underline-offset-4">{profile?.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">PERSONAL EMAIL</p>
                <p className="text-base text-on-surface font-bold opacity-80">juan.dela.c@gmail.com</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">MOBILE NUMBER</p>
                <p className="text-base text-on-surface font-bold">{profile?.phone ?? "+63 917 123 4567"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant mb-2 tracking-widest uppercase">HOME ADDRESS</p>
                <p className="text-sm text-on-surface font-bold leading-relaxed">{profile?.address ?? "123 Acacia Ave, Makati City"}</p>
              </div>
            </div>
          </div>

          {/* Government Statutory IDs */}
          <div className="bg-white border border-outline-variant rounded-[32px] p-10 shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <span className="material-symbols-outlined fill-1">gavel</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface">Government Statutory IDs</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "SSS ID", value: employee?.sss_number ?? "34-1234567-8" },
                { label: "PHILHEALTH", value: employee?.philhealth_number ?? "12-023456789-1" },
                { label: "PAG-IBIG", value: employee?.pagibig_number ?? "1210-4567-8912" },
                { label: "TIN (BIR)", value: employee?.tin_number ?? "432-109-876-000" },
              ].map((id) => (
                <div key={id.label} className="bg-surface-container-low/50 rounded-2xl p-5 border border-outline-variant/20 group hover:bg-primary/5 transition-all">
                  <p className="text-[9px] font-bold text-on-surface-variant mb-2 tracking-[0.15em] uppercase">{id.label}</p>
                  <p className="font-mono text-[13px] font-bold text-primary group-hover:scale-105 transition-transform origin-left">{id.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Contact Matrix */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-[32px] p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-6">
              <div className="bg-primary/20 p-4 rounded-full shadow-inner ring-4 ring-white/50">
                <span className="material-symbols-outlined text-primary text-2xl">emergency_share</span>
              </div>
              <div>
                <h4 className="text-lg font-bold text-on-surface mb-1">Emergency Contact</h4>
                <p className="text-sm text-on-surface-variant">
                  <span className="font-bold text-on-surface uppercase text-xs tracking-wider">Elena dela Cruz (Spouse)</span> 
                  <br className="sm:hidden" />
                  <span className="sm:ml-2 inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">call</span>
                    +63 918 987 6543
                  </span>
                </p>
              </div>
            </div>
            <button className="text-primary font-bold text-xs uppercase tracking-[0.2em] px-8 py-3 bg-white rounded-full hover:shadow-lg active:scale-95 transition-all border border-primary/10">
              Update Info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
