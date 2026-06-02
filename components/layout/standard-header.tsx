"use client";

import React from "react";

interface StandardHeaderProps {
  title: string;
}

export default function StandardHeader({ title }: StandardHeaderProps) {
  return (
    <header className="fixed left-0 top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-surface px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-text-primary">{title}</h1>
      </div>
    </header>
  );
}
