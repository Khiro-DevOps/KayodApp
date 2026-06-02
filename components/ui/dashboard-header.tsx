type DashboardHeaderProps = {
  companyName: string;
  displayName: string;
  displayRole: string;
  avatarUrl?: string | null;
  avatarAlt?: string;
};

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "A";
}

export default function DashboardHeader({
  companyName,
  displayName,
  displayRole,
  avatarUrl,
  avatarAlt = "User avatar",
}: DashboardHeaderProps) {
  const initials = getInitials(displayName);

  // 🚪 DESTROY SESSION AND FORCE LOGOUT
  const handleLogout = () => {
    console.log("Terminating session and logging out...");

    // 1. Clear storage mechanisms
    localStorage.clear();
    sessionStorage.clear();

    // 2. Clear all cookies to bypass auth middleware loops
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
      document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }

    // 3. Hard redirect back to login
    window.location.href = "/login";
  };

  return (
    <header className="fixed left-0 top-0 z-50 flex h-[56px] w-full items-center justify-between bg-navbar px-6 shadow-none">
      {/* Left Branding Group */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-6">
          <span className="font-[family-name:var(--font-poppins)] text-[22px] font-bold tracking-tight text-white">
            Kayod
          </span>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-[14px] font-medium text-white/80">{companyName}</span>
        </div>
      </div>

      {/* Center Group Spacer */}
      <div className="hidden flex-1 max-w-xl px-6 md:block">
        <div className="relative group" />
      </div>

      {/* Right Navigation & Profile Area */}
      <div className="flex items-center gap-1.5 text-white/80">
        
        {/* Notifications Icon */}
        <button
          type="button"
          className="relative rounded-full p-2 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />
        </button>

        {/* Help Icon */}
        <button
          type="button"
          className="rounded-full p-2 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Help"
        >
          <span className="material-symbols-outlined text-[20px]">help</span>
        </button>

        {/* Settings Icon */}
        <button
          type="button"
          className="rounded-full p-2 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Settings"
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
        </button>

        {/* --- INTERACTIVE AVATAR WRAPPER (HOVER ACTIVATED) --- */}
        <div className="relative ml-1.5 flex h-[56px] items-center gap-3 border-l border-white/20 pl-3 group cursor-pointer">
          
          {/* Label Details */}
          <div className="hidden text-right lg:block pointer-events-none">
            <p className="text-[14px] font-medium leading-tight text-white">{displayName}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{displayRole}</p>
          </div>
          
          {/* Circle Wrapper */}
          <div className="h-9 w-9 overflow-hidden rounded-full border-2 border-white/10 bg-white/10 pointer-events-none">
            {avatarUrl ? (
              <img alt={avatarAlt} className="h-full w-full object-cover" src={avatarUrl} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                {initials}
              </div>
            )}
          </div>

          {/* --- DROP DOWN MODAL BOX --- */}
          <div className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block z-50 clear-both">
            <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl text-slate-700 cursor-default">
              
              {/* Context Header */}
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Account</p>
                <p className="text-[13px] font-semibold text-slate-800 truncate">{displayName}</p>
              </div>

              {/* Functional Links */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-slate-50 text-slate-700 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[18px] text-slate-400">person</span>
                  My Profile
                </button>
                
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-slate-50 text-slate-700 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[18px] text-slate-400">domain</span>
                  Workspace Settings
                </button>

                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg hover:bg-slate-50 text-slate-700 transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[18px] text-slate-400">tune</span>
                  Preferences
                </button>
              </div>

              {/* Visual Separator */}
              <div className="my-1 border-t border-slate-100" />

              {/* Destructive Action Trigger */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-semibold rounded-lg hover:bg-red-50 text-red-600 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-red-500">logout</span>
                Log Out
              </button>

            </div>
          </div>
          {/* --- END OF MODAL WINDOW --- */}

        </div>
      </div>
    </header>
  );
}