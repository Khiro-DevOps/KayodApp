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
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-16 w-full max-w-[480px] items-center justify-around border-t border-[#e6e4f0] bg-[#f7f6fc]/95 px-3 backdrop-blur-sm shadow-[0_-6px_16px_rgba(39,36,84,0.08)] md:hidden">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] font-medium transition-all duration-200 ${isActive ? 'bg-[#e9e5ff] text-[#2d2b68]' : 'text-[#5d5a75] hover:text-[#2d2b68]'}`}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0"
              }}
            >
              {item.icon}
            </span>
            <span className="uppercase tracking-[0.08em]">
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}