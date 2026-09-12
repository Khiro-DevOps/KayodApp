// components/Header.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  userName: string;
  notificationCount: number; // Managed dynamically by your alert function
  applicationsCount: number;
  interviewsPendingCount: number;
}

export default function Header({
  userName,
  notificationCount,
  applicationsCount,
  interviewsPendingCount
}: HeaderProps) {
  const pathname = usePathname();

  // 1. Check if the current route is the main applicant dashboard page
  const isDashboard = pathname === '/applicant/home' || pathname === '/applicant';

  // 2. Map route names to dynamic titles for your standard sub-pages
  const getPageTitle = (path: string) => {
    if (path.startsWith('/applicant/jobs')) return 'Available Jobs';
    if (path.startsWith('/applicant/applications')) return 'My Applications';
    if (path.startsWith('/applicant/resume')) return 'AI Resume Builder';
    if (path.startsWith('/applicant/profile')) return 'Profile Settings';
    return 'Applicant Portal';
  };

  // Extract name initials dynamically
  const userInitials = userName
    ? userName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : "??";

  // --- REUSABLE SUB-COMPONENTS (Using the Dark Indigo Palette) ---

  // Dynamic Notification Badge Component
  const NotificationButton = () => (
    <Link
      href="/applicant/alerts"
      className="relative group cursor-pointer p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
      aria-label={`${notificationCount} notifications`}
    >
      <span className="material-symbols-outlined text-white text-2xl">
        notifications
      </span>
      {notificationCount > 0 && (
        <span className="absolute top-1 right-1 bg-error text-white font-badge text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full border-2 border-[#1a146b]">
          {notificationCount}
        </span>
      )}
    </Link>
  );

  // Dynamic Avatar Component (Uses the dark indigo background with white text)
  const UserAvatar = () => (
    <Link
      href="/applicant/profile"
      className="h-12 w-12 rounded-full bg-[#2a2394] flex items-center justify-center text-white font-semibold text-lg ring-2 ring-white/20 shadow-lg hover:bg-[#362eb5] transition-all select-none"
    >
      {userInitials}
    </Link>
  );

  // --- VARIANT A: THE DEEP HERO DASHBOARD HEADER (Dark Indigo Set) ---
  if (isDashboard) {
    return (
      <header className="sticky top-0 z-30 border-b border-[#e6e4f0] bg-[#2d2b68] px-4 pb-4 pt-5 text-white shadow-[0_8px_20px_rgba(39,36,84,0.18)]" id="top-header">
        <div className="mx-auto flex max-w-[480px] items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#cfcaf8]">Hello,</p>
            <h1 className="text-[22px] font-semibold leading-8 text-white">
              {userName}.
            </h1>
            <p className="text-[13px] leading-[20px] text-[#ece9ff]">Find your next opportunity</p>
          </div>

          <div className="flex items-center gap-3">
            <NotificationButton />
            <UserAvatar />
          </div>
        </div>

        <div className="mx-auto mt-4 grid max-w-[480px] grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white backdrop-blur-sm">
            <p className="text-[22px] font-semibold leading-none">{applicationsCount}</p>
            <p className="mt-1 text-[12px] text-[#ece9ff]">Applications</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-white backdrop-blur-sm">
            <p className="text-[22px] font-semibold leading-none">{interviewsPendingCount}</p>
            <p className="mt-1 text-[12px] text-[#ece9ff]">Interview pending</p>
          </div>
        </div>
      </header>
    );
  }

  // --- VARIANT B: STANDARD SUB-PAGE NAVBAR (Dark Indigo Set) ---
  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e4f0] bg-[#2d2b68] px-4 py-4 text-white shadow-[0_8px_20px_rgba(39,36,84,0.18)]" id="top-header">
      <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-white">
            {getPageTitle(pathname)}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <NotificationButton />
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}