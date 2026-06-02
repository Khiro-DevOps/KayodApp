"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Home", href: "/employee", icon: "home" },
  { label: "Schedule", href: "/employee/schedule", icon: "calendar_today" },
  { label: "Payslips", href: "/employee/payslips", icon: "payments" },
  { label: "Profile", href: "/employee/profile", icon: "person" },
];

export default function RootDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [userName, setUserName] = useState("Employee");
  const [userInitials, setUserInitials] = useState("JD");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserName(`${profile.first_name} ${profile.last_name}`);
        setUserInitials(`${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`);
        setAvatarUrl(profile.avatar_url);
      }
    }
    loadProfile();
  }, []);

  // Sync navigation active state with path
  const isActive = (href: string) => {
    if (href === "/employee") return pathname === "/employee";
    return pathname.startsWith(href);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen pb-24 md:pb-0 font-body">
      {/* TopAppBar (Desktop & Mobile Header) */}
      <header className="bg-primary docked full-width top-0 z-50 fixed h-16 flex items-center shadow-md">
        <div className="flex justify-between items-center w-full px-container-padding max-w-7xl mx-auto">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-on-primary opacity-60 leading-none mb-1 font-bold">
              {pathname.includes("employee") ? "Employee Portal" : "HR Console"}
            </span>
            <h1 className="text-lg font-bold text-on-primary truncate max-w-[200px] md:max-w-none tracking-tight">
              {userName}
            </h1>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button className="text-on-primary hover:opacity-100 transition-opacity p-2 relative rounded-xl hover:bg-white/10">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-primary"></span>
            </button>
            <div className="h-8 w-[1px] bg-white/20 mx-1 hidden md:block"></div>
            <Link href="/employee/profile" className="flex items-center transition-transform hover:scale-105">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-on-primary object-cover shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-bold border-2 border-on-primary text-sm">
                  {userInitials}
                </div>
              )}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto pt-16">
        {/* Desktop SideNav (64 width fixed = 256px) */}
        <aside className="hidden md:flex flex-col fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-surface-container-lowest border-r border-outline-variant p-6 z-40 overflow-y-auto">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${
                    active 
                      ? "bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 translate-x-2" 
                      : "text-on-surface-variant hover:bg-surface-container-low hover:translate-x-1"
                  }`}
                >
                  <span 
                    className="material-symbols-outlined transition-all group-hover:scale-110" 
                    style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span className="text-sm tracking-tight">{item.label}</span>
                  {active && <div className="ml-auto w-1.5 h-1.5 bg-on-primary rounded-full animate-pulse"></div>}
                </Link>
              );
            })}
          </nav>
          
          <div className="mt-auto pt-6 border-t border-outline-variant space-y-2">
             <Link
              href="/logout"
              className="flex items-center gap-4 px-5 py-4 text-error font-bold text-sm hover:bg-error-container/20 rounded-2xl transition-all group"
            >
              <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">logout</span>
              <span>Sign Out</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 md:ml-64 w-full min-h-[calc(100vh-64px)] overflow-x-hidden">
          <div className="p-container-padding md:p-10">
            {children}
          </div>
        </main>
      </div>

      {/* Floating Bottom Tab Bar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-t border-outline-variant/30 flex justify-around items-end px-6 pb-6 pt-3 md:hidden shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link 
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center transition-all duration-500 relative ${
                active ? "text-primary -translate-y-2 scale-110" : "text-on-surface-variant opacity-50"
              }`}
            >
              <div className={`p-2.5 rounded-full transition-all duration-500 ${active ? "bg-primary/10 shadow-inner" : ""}`}>
                <span 
                  className="material-symbols-outlined scale-110" 
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
              </div>
              <span className={`text-[10px] font-bold uppercase mt-1 tracking-widest transition-all ${active ? "opacity-100" : "opacity-0 h-0"}`}>
                {item.label}
              </span>
              {active && (
                <div className="absolute -top-1 w-1 h-1 bg-primary rounded-full animate-ping"></div>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
