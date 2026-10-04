"use client";

import React from "react";

interface CalendarExportButtonProps {
  title: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  meetingLink?: string | null;
  className?: string;
}

export function CalendarExportButton({
  title,
  startTime,
  endTime,
  meetingLink,
  className,
}: CalendarExportButtonProps) {
  const handleDownload = () => {
    const formatDate = (isoStr: string) => {
      const date = new Date(isoStr);
      return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const startFormatted = formatDate(startTime);
    const endFormatted = formatDate(endTime);

    const description = meetingLink
      ? `Interview link: ${meetingLink}`
      : `Kayod Platform Scheduled Interview`;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kayod Platform//Interview Schedule//EN",
      "BEGIN:VEVENT",
      `SUMMARY:${title}`,
      `DTSTART:${startFormatted}`,
      `DTEND:${endFormatted}`,
      `DESCRIPTION:${description}`,
      meetingLink ? `LOCATION:${meetingLink}` : "LOCATION:Online Meeting",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `interview-${Date.now()}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={
        className ||
        "inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60 transition-colors"
      }
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span>Export to Calendar (.ics)</span>
    </button>
  );
}
