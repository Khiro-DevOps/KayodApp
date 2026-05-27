"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/layout/bottom-nav";
import type { UserRole } from "@/lib/types";

interface DashboardShellProps {
  children: ReactNode;
  role: UserRole;
  userId?: string | null;
  initialUnreadCount?: number;
}

export default function DashboardShell({ children, role, userId = null, initialUnreadCount = 0 }: DashboardShellProps) {
  const pathname = usePathname();
  const isMeetingRoom = typeof pathname === "string" && pathname.includes("/interviews/") && pathname.includes("/room");

  if (isMeetingRoom) {
    return <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#0f0f11] text-white">{children}</div>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav role={role} userId={userId} initialUnreadCount={initialUnreadCount} />
    </div>
  );
}
