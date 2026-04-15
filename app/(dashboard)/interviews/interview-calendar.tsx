"use client";
// app/(dashboard)/interviews/interview-calendar.tsx
// Click any day to schedule an interview — opens a quick modal pre-filled with that date.

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Interview } from "@/lib/types";

interface Props {
  interviews: Interview[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function InterviewCalendar({ interviews }: Props) {
  const router = useRouter();
  const today = new Date();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Build a map of date → interview count
  const interviewDates = useMemo(() => {
    const map: Record<string, number> = {};
    interviews.forEach((i) => {
      const d = new Date(i.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [interviews]);

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }

  function handleDayClick(day: number) {
    const date = new Date(currentYear, currentMonth, day);
    // Don't allow scheduling in the past
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (date < todayMidnight) return;

    setSelectedDate(date);
    setModalOpen(true);
  }

  function handleScheduleFromModal() {
    if (!selectedDate) return;
    // Format as YYYY-MM-DD for the URL
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(selectedDate.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    setModalOpen(false);
    router.push(`/interviews/schedule?date=${dateStr}`);
  }

  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return (
    <>
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {MONTHS[currentMonth]} {currentYear}
          </h3>
          <div className="flex gap-1">
            <button
              onClick={prevMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={nextMonth}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-gray-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-0.5">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-text-secondary py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = `${currentYear}-${currentMonth}-${day}`;
            const count = interviewDates[key] ?? 0;
            const isToday = key === todayKey;
            const isPast = new Date(currentYear, currentMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const isSelected =
              selectedDate &&
              selectedDate.getFullYear() === currentYear &&
              selectedDate.getMonth() === currentMonth &&
              selectedDate.getDate() === day;

            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                disabled={isPast}
                title={isPast ? undefined : count > 0 ? `${count} interview(s) — click to schedule` : "Click to schedule"}
                className={`
                  relative flex flex-col items-center justify-center rounded-xl py-1.5 text-xs font-medium transition-all
                  ${isPast
                    ? "text-text-tertiary cursor-not-allowed"
                    : isSelected
                    ? "bg-primary text-white shadow-sm"
                    : isToday
                    ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-white cursor-pointer"
                    : "text-text-primary hover:bg-primary/10 hover:text-primary cursor-pointer"
                  }
                `}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isSelected ? "bg-white" : "bg-primary"}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-1 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-xs text-text-secondary">Has interview(s)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary/30 border border-primary/50" />
            <span className="text-xs text-text-secondary">Today</span>
          </div>
          <p className="text-xs text-text-tertiary ml-auto">Click a future date to schedule</p>
        </div>
      </div>

      {/* Quick Schedule Modal */}
      {modalOpen && selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-border p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">Schedule Interview</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {selectedDate.toLocaleDateString("en-PH", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Existing interviews on this day */}
            {(() => {
              const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
              const count = interviewDates[key] ?? 0;
              if (count === 0) return null;
              return (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs text-amber-800">
                    ⚠️ There {count === 1 ? "is" : "are"} already <strong>{count}</strong> interview{count > 1 ? "s" : ""} on this day.
                  </p>
                </div>
              );
            })()}

            <p className="text-xs text-text-secondary">
              The date will be pre-filled. You'll choose the time and applicant on the next page.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleFromModal}
                className="flex-1 rounded-xl bg-primary py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}