"use client";

import React, { useState, useTransition } from "react";
import { toggleDevUserRole } from "@/app/actions/dev-role-toggle";
import { resetApplicantTestData } from "@/app/actions/debug";
import { toast } from "sonner";

export function DevRoleToggle() {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Render strictly in development mode
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const handleToggle = (targetRole?: "applicant" | "employee") => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await toggleDevUserRole(targetRole);
      if (!res.success) {
        setErrorMsg(res.error ?? "Failed to toggle role");
        return;
      }

      // Clear client storage
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore storage errors
      }

      // Hard navigation to trigger auth middleware & session re-evaluation
      const destination = res.targetRoute ?? (res.newRole === "employee" ? "/employee/dashboard" : "/applicant/jobs");
      window.location.href = destination;
    });
  };

  const handleResetTestData = () => {
    setErrorMsg(null);
    if (!window.confirm("Are you sure you want to wipe test application data and reset your role to applicant?")) {
      return;
    }

    startTransition(async () => {
      const res = await resetApplicantTestData();
      if (!res.success) {
        const err = res.error ?? "Failed to reset test data";
        setErrorMsg(err);
        toast.error(err);
        return;
      }

      toast.success(res.message ?? "Test application data wiped successfully!");
      // Refresh page or trigger client state update
      window.location.reload();
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 text-xs font-sans">
      {errorMsg && (
        <div className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white shadow-lg animate-bounce">
          {errorMsg}
        </div>
      )}
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-gray-900/90 p-1.5 text-white shadow-2xl backdrop-blur-md">
        <span className="ml-2.5 flex items-center gap-1.5 font-bold tracking-wide text-amber-400">
          <span className="material-symbols-outlined text-[16px]">bug_report</span>
          DEV ROLE
        </span>
        <div className="h-4 w-[1px] bg-white/20" />
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleToggle("applicant")}
          className="rounded-full bg-blue-600/80 px-3 py-1 font-semibold text-white transition-all hover:bg-blue-600 hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Switching..." : "Applicant"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleToggle("employee")}
          className="rounded-full bg-emerald-600/80 px-3 py-1 font-semibold text-white transition-all hover:bg-emerald-600 hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Switching..." : "Employee"}
        </button>
        <div className="h-4 w-[1px] bg-white/20" />
        <button
          type="button"
          disabled={isPending}
          onClick={handleResetTestData}
          title="Reset Test Data"
          className="flex items-center gap-1 rounded-full bg-rose-600/80 px-3 py-1 font-semibold text-white transition-all hover:bg-rose-600 hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
          <span>Reset Test Data</span>
        </button>
      </div>
    </div>
  );
}

