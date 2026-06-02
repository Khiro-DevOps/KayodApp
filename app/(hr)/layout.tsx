"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
  badge?: string;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/hr", icon: "dashboard", exact: true },
  { label: "Employees", href: "/hr/employees", icon: "group" },
  { label: "Applicants", href: "/hr/applicants", icon: "layers", badge: "12" },
  { label: "Manage Jobs", href: "/hr/jobs/manage", icon: "work" },
  { label: "Payroll", href: "/hr/payroll", icon: "payments" },
  { label: "Reports", href: "/hr/analytics", icon: "assessment" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [companyName, setCompanyName] = useState("Company");
  const [displayName, setDisplayName] = useState("Admin User");
  const [displayRole, setDisplayRole] = useState("HR Manager");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }

    const unPrefixed = item.href.replace("/hr/", "/");
    return pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname === unPrefixed || pathname.startsWith(`${unPrefixed}/`);
  };

  useEffect(() => {
    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const { fetchUserOnce } = await import("@/lib/hooks/useAuth");
        const user = await fetchUserOnce();
        if (!isMounted || !user) return;

        const supabase = createClient();

        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url, tenant_name, tenant_id, role")
          .eq("id", user.id)
          .maybeSingle<{
            first_name?: string | null;
            last_name?: string | null;
            avatar_url?: string | null;
            tenant_name?: string | null;
            tenant_id?: string | null;
            role?: string | null;
          }>();

        if (!isMounted || !profile) return;

        const nextName = [profile.first_name ?? "", profile.last_name ?? ""].filter(Boolean).join(" ") || "Admin User";
        let nextCompanyName = profile.tenant_name?.trim() || "Company";

        if ((!nextCompanyName || nextCompanyName === "Company") && profile.tenant_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("id", profile.tenant_id)
            .maybeSingle<{ name?: string | null }>();

          if (company?.name) {
            nextCompanyName = company.name.trim();
          }
        }

        setCompanyName(nextCompanyName || "Company");
        setDisplayName(nextName);
        setDisplayRole(profile.role ? profile.role.replace("hr_manager", "HR Manager") : "HR Manager");
        setAvatarUrl(profile.avatar_url ?? null);
      } catch (err) {
        // swallow
      }
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
      document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-[#fcf8ff] text-[#171542]">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 w-full h-[56px] bg-kayod-deep flex items-center justify-between px-xxl z-50 no-shadow">
        <div className="flex items-center gap-xl">
          <span className="font-h1 text-h1 font-bold text-white tracking-tight">Kayod</span>
          <div className="h-6 w-[1px] bg-white/20"></div>
          <span className="font-h3 text-h3 text-white/80">{companyName}</span>
        </div>
        <div className="flex-1 max-w-xl mx-xxl hidden md:block">
          <div className="relative group"></div>
        </div>
        <div className="flex items-center gap-md">
          <button className="p-2 text-white/80 hover:bg-white/10 rounded-full relative transition-colors">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
          </button>
          <button className="p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors">
            <span className="material-symbols-outlined">help</span>
          </button>
          <button className="p-2 text-white/80 hover:bg-white/10 rounded-full transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          
          <div 
            className="relative flex items-center gap-sm ml-sm pl-md border-l border-white/20 cursor-pointer"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <div className="text-right mr-sm hidden lg:block">
              <p className="font-h3 text-h3 text-white leading-tight">{displayName}</p>
              <p className="text-[11px] text-white/60 font-medium uppercase tracking-wider">{displayRole}</p>
            </div>
            <img 
              alt="HR Admin" 
              className="w-9 h-9 rounded-full object-cover border-2 border-white/10" 
              src={avatarUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuCEJTQOVYbNbVbttcEjj07d7oPkn5VL1_jhJaXakwYzP3LelWCwmnZAkXq01hyJ1_MP1vc-OLcoXIrSp-x098UsYiz8mPw_OVj-GvH6XPGc0r4NVoeb3udjSBpSP529ub6TjokpbBC_LU1h_rkAP-HDDzCVH5h4xhwn88jbykv1ubJF0wi2rSwa6-HeeHaIZ1VY3t7u6Okz0YSwXU-QRKL8k6VKRloesItQ2qqjHbrP2Zm-WnUG3XlcKF8BGXGraexDeCF0UjH2TUo8"} 
            />

            {/* Dropdown Modal Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-full pt-2 w-56 z-50">
                <div className="rounded-xl border border-outline-variant bg-white p-1.5 shadow-xl text-[#171542]">
                  <div className="px-3 py-2 border-b border-outline-variant mb-1">
                    <p className="text-[11px] font-medium text-outline uppercase tracking-wider">Account</p>
                    <p className="text-[13px] font-semibold text-on-surface truncate">{displayName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-container text-on-surface transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-outline">person</span>
                      My Profile
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-surface-container text-on-surface transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-outline">domain</span>
                      Workspace Settings
                    </button>
                  </div>
                  <div className="my-1 border-t border-outline-variant" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold rounded-lg hover:bg-error-container text-error transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Side Navigation Bar */}
      <aside className="fixed left-0 top-[56px] w-[220px] h-[calc(100vh-56px)] bg-surface border-r border-outline-variant flex flex-col z-40">
        <nav className="flex-1 py-md">
          {navItems.map((item) => {
            const active = isActive(item);

            if (active) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="bg-primary text-on-primary rounded-lg mx-2 my-1 flex items-center gap-sm px-4 py-3 transition-all scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span className="font-body text-body font-medium">{item.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-secondary hover:bg-surface-container-high transition-colors rounded-lg mx-2 my-1 flex items-center justify-between px-4 py-3 group"
              >
                <div className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span className="font-body text-body">{item.label}</span>
                </div>
                {item.badge ? (
                  <span className="bg-primary-container text-on-primary-container text-[10px] px-1.5 py-0.5 rounded font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-md mt-auto border-t border-outline-variant">
          <Link
            href="/support"
            className="text-secondary hover:bg-surface-container-high transition-colors rounded-lg flex items-center gap-sm px-4 py-3"
          >
            <span className="material-symbols-outlined text-[20px]">contact_support</span>
            <span className="font-body text-body">Support</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-[220px] pt-[56px] min-h-screen bg-background p-xxl">
        {children}
      </main>
    </div>
  );
}