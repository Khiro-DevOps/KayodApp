"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

type ClockState = "loading" | "locating" | "success" | "error" | "outside_zone";

export function TimeClockModule() {
  const [time, setTime] = useState(new Date());
  const [status, setStatus] = useState<ClockState>("loading");
  const [locationPulse, setLocationPulse] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Simulate geolocation verification
    setStatus("locating");
    const timer = setTimeout(() => {
      setStatus("success");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const getStatusBadge = () => {
    switch (status) {
      case "locating":
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/10 text-secondary border border-secondary/20 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-secondary animate-ping"></div>
            <span className="text-[10px] font-bold tracking-widest uppercase">Verifying Location...</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
            <span className="text-[10px] font-bold tracking-widest uppercase font-display">In Work Zone</span>
          </div>
        );
      case "outside_zone":
      case "error":
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-[10px] font-bold tracking-widest uppercase">Outside Zone</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[24px] p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary/10 transition-colors"></div>
      
      <div className="flex justify-between items-center mb-10 relative z-10">
        <h3 className="font-bold text-[11px] tracking-widest text-on-surface-variant uppercase">Time Clock</h3>
        {getStatusBadge()}
      </div>

      <div className="text-center py-4 mb-8 relative z-10">
        <div className="font-display text-[52px] leading-none text-primary font-bold tracking-tighter mb-4 tabular-nums drop-shadow-sm">
          {format(time, "hh:mm aa").toUpperCase()}
        </div>
        <p className="text-sm font-semibold text-on-surface-variant tracking-wide">
          {format(time, "EEEE, MMMM dd yyyy")}
        </p>
      </div>

      <div className="space-y-4 relative z-10">
        <button 
          disabled={status !== "success"}
          className={`w-full py-5 rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${
            status === "success" 
              ? "bg-primary text-on-primary hover:brightness-110 hover:shadow-primary/20" 
              : "bg-slate-100 text-slate-400 cursor-not-allowed opacity-50"
          }`}
        >
          <span className="material-symbols-outlined text-2xl">login</span>
          {status === "locating" ? "VERIFYING..." : "CLOCK IN"}
        </button>
        <div className="flex items-center justify-center gap-2">
           <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-bounce"></span>
           <p className="text-center text-[12px] text-on-surface-variant font-medium italic">
             Current Shift: 09:00 AM - 06:00 PM
           </p>
        </div>
      </div>
    </div>
  );
}
