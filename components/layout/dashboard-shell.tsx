"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/layout/bottom-nav";
import { RoleSidebar, pwaAppFrame, pwaShellBackground } from "@/components/layout/pwa-shell";
import type { UserRole } from "@/lib/types";

interface DashboardShellProps {
  children: ReactNode;
  role: UserRole;
  userId?: string | null;
  initialUnreadCount?: number;
  layoutName?: string;
}

export default function DashboardShell({
  children,
  role,
  userId = null,
  initialUnreadCount = 0,
  layoutName,
}: DashboardShellProps) {
  const pathname = usePathname();
  const isMeetingRoom = typeof pathname === "string" && pathname.includes("/interviews/") && pathname.includes("/room");

  if (isMeetingRoom) {
    return <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#0f0f11] text-white">{children}</div>;
  }

  return (
    <div className={pwaShellBackground} data-layout={layoutName ?? "pwa"}>
      <div className={pwaAppFrame}>
        <RoleSidebar variant="employee" />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 bg-[#f7f6fc] pb-20 md:pb-6">{children}</main>
          <BottomNav role={role} userId={userId} initialUnreadCount={initialUnreadCount} />
        </div>
      </div>
    </div>
  );
}
