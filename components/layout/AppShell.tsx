"use client";

import React from "react";
import { useLayout } from "@/context/LayoutContext";
import StandardHeader from "@/components/layout/standard-header";
import BottomNav from "@/components/layout/bottom-nav";

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  customHeader?: boolean;
}

export default function AppShell({
  children,
  pageTitle = "Kayod",
  customHeader = false,
}: AppShellProps) {
  const { isCallActive } = useLayout();

  if (isCallActive) {
    return (
      <div className="p-0 m-0 w-screen h-screen overflow-hidden bg-black">
        <main className="h-full w-full">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {!customHeader && <StandardHeader title={pageTitle} />}
      
      <main className={`flex-1 ${!customHeader ? 'pt-14' : ''} pb-[calc(64px+16px)] md:pb-6`}>
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
