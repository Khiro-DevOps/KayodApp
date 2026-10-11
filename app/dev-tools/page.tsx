"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleDevUserRole } from "@/app/actions/dev-role-toggle";
import { resetApplicantTestData } from "@/app/actions/debug";

const STAGES = [
  {
    value: "applied",
    label: "1 — Applied / Submitted",
  },
  {
    value: "screening",
    label: "2 — Screening / Under Review",
  },
  {
    value: "interview",
    label: "3 — Interview Scheduled",
  },
  {
    value: "offer",
    label: "4 — Offer & Contract",
  },
  {
    value: "hired",
    label: "5 — Hired / Employee",
  },
  {
    value: "rejected",
    label: "6 — Rejected",
  },
] as const;

type Stage = (typeof STAGES)[number]["value"];

type Role = "applicant" | "employee" | "hr_manager";

export default function DevToolsPage() {
  const [isPending, startTransition] = useTransition();
  const [applicationId, setApplicationId] = useState("");
  const [email, setEmail] = useState("");
  const [selectedStage, setSelectedStage] = useState<Stage>("applied");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleStageChange = () => {
    clearMessages();

    if (!applicationId.trim()) {
      const message = "Enter an application UUID first.";
      setErrorMsg(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/dev/control", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_stage",
            applicationId: applicationId.trim(),
            stage: selectedStage,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          const message =
            result.error ?? "Failed to update application stage.";

          setErrorMsg(message);
          toast.error(message);
          return;
        }

        const message =
          result.message ??
          `Application moved to ${selectedStage}.`;

        setSuccessMsg(message);
        toast.success(message);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update application stage.";

        setErrorMsg(message);
        toast.error(message);
      }
    });
  };

  const handleRoleChange = (targetRole: Role) => {
    clearMessages();

    startTransition(async () => {
      const result = await toggleDevUserRole(
        targetRole,
        email.trim() || undefined
      );

      if (!result.success) {
        const message = result.error ?? "Failed to change account role.";
        setErrorMsg(message);
        toast.error(message);
        return;
      }

      const message =
        result.message ?? `Account role changed to ${targetRole}.`;
      setSuccessMsg(message);
      toast.success(message);

      if (result.isCurrentUser) {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // Storage may be unavailable; navigation is still required.
        }

        const destination =
          result.targetRoute ??
          (targetRole === "employee"
            ? "/employee/dashboard"
            : targetRole === "hr_manager"
              ? "/hr/dashboard"
              : "/applicant/jobs");

        window.location.href = destination;
      }
    });
  };

  const handleReset = () => {
    clearMessages();

    const target = email.trim() || "the currently authenticated account";

    if (
      !window.confirm(
        `Are you sure you want to delete test application data for ${target}?`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await resetApplicantTestData(
        email.trim() || undefined
      );

      if (!result.success) {
        const message = result.error ?? "Failed to reset test data.";
        setErrorMsg(message);
        toast.error(message);
        return;
      }

      const message =
        result.message ??
        "Test application data reset successfully.";

      setSuccessMsg(message);
      toast.success(message);
    });
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            🛠 Centralized Dev Control Matrix
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Development-only controls for testing the Kayod hiring workflow.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {successMsg}
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="text-xl font-semibold">
            1. Application Stage Switcher
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Change the pipeline stage of a specific application.
          </p>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Application UUID
            </label>

            <input
              type="text"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              placeholder="Enter application UUID"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-purple-500"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((stage) => (
              <button
                key={stage.value}
                type="button"
                disabled={isPending}
                onClick={() => setSelectedStage(stage.value)}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  selectedStage === stage.value
                    ? "border-purple-500 bg-purple-500/20 text-purple-200"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {stage.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={handleStageChange}
            className="mt-5 rounded-lg bg-purple-600 px-5 py-3 text-sm font-semibold transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Updating..." : "Update Application Stage"}
          </button>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="text-xl font-semibold">
            2. Account Role Switcher
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Enter an email to change that account&apos;s development role.
            Leave it empty to use the currently authenticated account.
          </p>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Account Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@email.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:border-purple-500"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRoleChange("applicant")}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Switching..." : "Applicant"}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRoleChange("employee")}
              className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Switching..." : "Employee"}
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRoleChange("hr_manager")}
              className="rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Switching..." : "HR Manager"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-red-900/60 bg-slate-900 p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-red-300">
            3. Reset Test Data
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Deletes the selected account&apos;s job applications and
            interview schedules. The profile and uploaded resumes remain.
          </p>

          <button
            type="button"
            disabled={isPending}
            onClick={handleReset}
            className="mt-5 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Resetting..." : "Reset Test Data"}
          </button>
        </section>
      </div>
    </main>
  );
}