"use client";

import { Interview } from "@/lib/types";
import { useState } from "react";

interface InterviewCalendarProps {
  interviews: Interview[];
}

export function InterviewCalendar({ interviews }: InterviewCalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Get the first day of the month and the number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  // Create array of days
  const days: (number | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // Group interviews by date
  const interviewsByDate: Record<string, Interview[]> = {};
  interviews.forEach((interview) => {
    const date = new Date(interview.scheduled_at);
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!interviewsByDate[dateKey]) {
      interviewsByDate[dateKey] = [];
    }
    interviewsByDate[dateKey].push(interview);
  });

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const getInterviewsForDay = (day: number): Interview[] => {
    const dateKey = `${year}-${month}-${day}`;
    return interviewsByDate[dateKey] || [];
  };

  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-text-primary">
          {currentMonth.toLocaleDateString("en-PH", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          onClick={handleNextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 001.05.02l4.5-4.25a.75.75 0 000-1.08l-4.5-4.25a.75.75 0 00-1.06.02a.75.75 0 01.02 1.06L11.168 10 7.23 13.71a.75.75 0 00.02 1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-2xl border border-border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-surface border-b border-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="p-3 text-center text-xs font-semibold text-text-secondary uppercase">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayInterviews = day ? getInterviewsForDay(day) : [];
            const isTodayDate = day ? isToday(day) : false;

            return (
              <div
                key={index}
                className={`min-h-24 p-2 border-r border-b border-border relative ${
                  day === null ? "bg-gray-50" : ""
                } ${
                  isTodayDate
                    ? "bg-primary/5 border-primary/30"
                    : day
                    ? "bg-white hover:bg-gray-50"
                    : ""
                }`}
              >
                {day && (
                  <>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-medium ${
                          isTodayDate
                            ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold"
                            : "text-text-primary"
                        }`}
                      >
                        {day}
                      </span>
                      {isTodayDate && dayInterviews.length > 0 && (
                        <span className="text-xl">📅</span>
                      )}
                    </div>

                    {/* Interview indicators */}
                    {dayInterviews.length > 0 && (
                      <div className="mt-1 space-y-1">
                        <div className="text-xs text-text-secondary font-medium">
                          {dayInterviews.length} interview{dayInterviews.length > 1 ? "s" : ""}
                        </div>
                        <div className="space-y-0.5">
                          {dayInterviews.slice(0, 2).map((interview) => {
                            const app = interview.applications as unknown as {
                              profiles?: {
                                first_name: string;
                                last_name: string;
                              };
                              job_postings?: { title: string };
                            };
                            const candidateName = app?.profiles
                              ? `${app.profiles.first_name} ${app.profiles.last_name}`
                              : "Candidate";

                            return (
                              <div
                                key={interview.id}
                                className={`text-xs px-1.5 py-0.5 rounded truncate ${
                                  interview.interview_type === "online"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {candidateName.split(" ")[0]}
                              </div>
                            );
                          })}
                          {dayInterviews.length > 2 && (
                            <div className="text-xs text-text-secondary">
                              +{dayInterviews.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
