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
      <header className="bg-[#1a146b] pt-10 pb-28 md:pb-36 px-4 md:px-8 sticky top-0 z-30 transition-all duration-300" id="top-header">
        <div className="max-w-6xl mx-auto flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-white/70 font-body text-body">Hello,</p>
            <h1 className="text-white font-h1 text-h1-mobile md:text-h1 tracking-tight">
              {userName}.
            </h1>
            <p className="text-white/60 font-body text-body-sm">Find your next opportunity</p>
          </div>

          <div className="flex items-center gap-4">
            <NotificationButton />
            <UserAvatar />
          </div>
        </div>

        {/* Metric Cards Overlay */}
        <div className="max-w-6xl mx-auto mt-8 grid grid-cols-2 gap-4">
          <div className="bg-white/10 backdrop-blur-md rounded-rounded-card p-card-padding border border-white/20 text-white">
            <p className="font-h1 text-h1 leading-none">{applicationsCount}</p>
            <p className="font-body text-body-sm opacity-80 mt-1">Applications</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-rounded-card p-card-padding border border-white/20 text-white">
            <p className="font-h1 text-h1 leading-none">{interviewsPendingCount}</p>
            <p className="font-body text-body-sm opacity-80 mt-1">Interview pending</p>
          </div>
        </div>
      </header>
    );
  }

  // --- VARIANT B: STANDARD SUB-PAGE NAVBAR (Dark Indigo Set) ---
  return (
    <header className="bg-[#1a146b] py-4 px-4 md:px-8 sticky top-0 z-30 transition-all duration-300 shadow-sm border-b border-[#2a2394]" id="top-header">
      <div className="max-w-6xl mx-auto flex justify-between items-center">

        {/* Simplified Page Title Display */}
        <div>
          <h1 className="text-white font-h2 text-h2 tracking-tight">
            {getPageTitle(pathname)}
          </h1>
        </div>

        {/* Action Elements Layer */}
        <div className="flex items-center gap-4">
          <NotificationButton />
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}