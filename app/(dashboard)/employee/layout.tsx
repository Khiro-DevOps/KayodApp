"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  mobileOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Home", href: "/employee", icon: "home" },
  { label: "Schedule", href: "/employee/schedule", icon: "calendar_today" },
  { label: "Payslips", href: "/employee/payslips", icon: "payments" },
  { label: "Profile", href: "/employee/profile", icon: "person" },
];

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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

  const isActive = (href: string) => {
    if (href === "/employee") return pathname === "/employee";
    return pathname.startsWith(href);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen pb-24 md:pb-0">
      {/* TopAppBar (Desktop & Mobile Header) */}
      <header className="bg-primary docked full-width top-0 z-50 sticky md:fixed h-16 flex items-center shadow-sm">
        <div className="flex justify-between items-center w-full px-container-padding max-w-6xl mx-auto">
          <div className="flex flex-col">
            <span className="font-body text-body-sm text-on-primary opacity-80 leading-none mb-1">
              {pathname === "/employee" ? "Good morning," : "Employee Portal"}
            </span>
            <h1 className="text-title-lg font-bold text-on-primary truncate max-w-[200px] md:max-w-none">
              {userName}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="text-on-primary hover:opacity-80 transition-opacity p-2 relative rounded-full hover:bg-white/10">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-primary"></span>
            </button>
            <Link href="/employee/profile" className="flex items-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-on-primary object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container font-bold border-2 border-on-primary">
                  {userInitials}
                </div>
              )}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex max-w-6xl mx-auto pt-0 md:pt-16">
        {/* Desktop SideNav (64 width fixed) */}
        <aside className="hidden md:flex flex-col fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-surface border-r border-outline-variant p-4 z-40 overflow-y-auto">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    active 
                      ? "bg-primary text-on-primary font-bold shadow-md transform translate-x-1" 
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  <span className={`material-symbols-outlined ${active ? "fill-1" : ""}`} style={{ fontVariationSettings: active ? "'FILL' 1" : "" }}>
                    {item.icon}
                  </span>
                  <span className="font-body text-body-md">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="mt-auto pt-4 border-t border-outline-variant space-y-1">
             <Link
              href="/logout"
              className="flex items-center gap-3 px-4 py-3 text-error hover:bg-error-container/20 rounded-xl transition-all"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-body text-body-md font-medium">Sign Out</span>
            </Link>
          </div>
        </aside>

        {/* Main Content Container */}
        <main className="flex-1 md:ml-64 w-full">
          <div className="p-container-padding min-h-[calc(100vh-64px)]">
            {children}
          </div>
        </main>
      </div>

      {/* Floating Bottom Tab Bar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-white/80 backdrop-blur-md border-t border-outline-variant flex justify-around items-center px-4 py-3 md:hidden shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link 
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center transition-all duration-300 ${
                active ? "text-primary scale-110" : "text-on-surface-variant opacity-60"
              }`}
            >
              <span 
                className="material-symbols-outlined" 
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] uppercase font-bold mt-1 tracking-tighter ${active ? "visible" : "visible"}`}>
                {item.label}
              </span>
              {active && <div className="h-1 w-1 bg-primary rounded-full mt-1"></div>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
