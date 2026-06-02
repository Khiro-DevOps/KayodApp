// components/BottomNav.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Home', href: '/applicant/home', icon: 'home' },
    { name: 'Jobs', href: '/applicant/jobs', icon: 'work' },
    { name: 'Applications', href: '/applicant/applications', icon: 'assignment' },
    { name: 'Resume', href: '/applicant/resume', icon: 'description' },
    { name: 'Profile', href: '/applicant/profile', icon: 'account_circle' },
  ];

  return (
    // Removed md:hidden so it's globally forced visible across all desktop frames
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-outline-variant flex justify-around items-center px-4 h-16 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex flex-col items-center justify-center w-full h-full transition-transform active:scale-90 duration-200 ${isActive ? 'text-primary font-bold' : 'text-[#474651] hover:text-primary'
              }`}
          >
            <span
              className="material-symbols-outlined text-[24px]"
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0"
              }}
            >
              {item.icon}
            </span>
            <span className="text-[10px] mt-0.5 uppercase tracking-widest font-semibold">
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}