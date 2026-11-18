"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleDevUserRole } from "@/app/actions/dev-role-toggle";
import { resetApplicantTestData } from "@/app/actions/debug";
import {
  getStageForStatus,
  getStatusesForStage,
  UI_STAGES,
  type UiStageKey,
} from "@/lib/application-stages";

const ALL_STATUSES = UI_STAGES.flatMap((stage) =>
  getStatusesForStage(stage.key)
);

const OPEN_STAGES = UI_STAGES.slice(
  0,
  UI_STAGES.findIndex(
    (stage) => stage.key === "hired" || stage.key === "closed"
  )
);

const PRESET_STATUS_KEYS = [
  "offer_declined",
  "offer_expired",
  "withdrawn",
] as const;

const PRESET_STATUSES = PRESET_STATUS_KEYS.filter((status) =>
  ALL_STATUSES.includes(status)
);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCanonicalStatus(stageKey: UiStageKey): string | undefined {
  return getStatusesForStage(stageKey)[0];
}

type Role = "applicant" | "employee" | "hr_manager";

export default function DevToolsPage() {
  const [isPending, startTransition] = useTransition();
  const [applicationId, setApplicationId] = useState("");
  const [email, setEmail] = useState("");
  const [activeStage, setActiveStage] = useState<UiStageKey | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const trimmedAppId = applicationId.trim();
  const isValidUuid = UUID_REGEX.test(trimmedAppId);
  const controlsDisabled = !isValidUuid || isPending;

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const postStatus = (targetStatus: string, targetStageKey?: UiStageKey) => {
    clearMessages();

    if (!isValidUuid) {
      const message = "Enter a valid application UUID first.";
      setErrorMsg(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/dev/control", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_stage",
            applicationId: trimmedAppId,
            stage: targetStatus,
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

        const resolvedStage =
          targetStageKey ?? getStageForStatus(targetStatus);
        setActiveStage(resolvedStage);
        setActiveStatus(targetStatus);

        const message =
          result.message ??
          `Application moved to ${targetStatus}.`;

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

  const handleNextStage = () => {
    if (OPEN_STAGES.length === 0) return;
    const currentIndex = activeStage
      ? OPEN_STAGES.findIndex((stage) => stage.key === activeStage)
      : -1;
    const nextStage =
      OPEN_STAGES[(currentIndex + 1) % OPEN_STAGES.length];
    const canonical = getCanonicalStatus(nextStage.key);
    if (!canonical) return;
    postStatus(canonical, nextStage.key);
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

  const handleResetOfferTest = () => {
    clearMessages();

    if (!isValidUuid) {
      const message = "Enter a valid application UUID first.";
      setErrorMsg(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/dev/reset-application", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            applicationId: trimmedAppId,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          const message = result.error ?? "Failed to reset offer test.";
          setErrorMsg(message);
          toast.error(message);
          return;
        }

        setActiveStage("offer");
        setActiveStatus("offer");
        const message = "Offer chain reset to 'offer' stage.";
        setSuccessMsg(message);
        toast.success(message);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to reset offer test.";
        setErrorMsg(message);
        toast.error(message);
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

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="text-xl font-semibold">
            1. Set Application Stage
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

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Stage
            </label>
            <div className="flex flex-wrap gap-2">
              {UI_STAGES.map((stage) => {
                const canonical = getCanonicalStatus(stage.key);
                const isActive = activeStage === stage.key;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    disabled={controlsDisabled || !canonical}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (canonical) {
                        postStatus(canonical, stage.key);
                      }
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive
                        ? "border-purple-500 bg-purple-600 text-white"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-purple-500/60 hover:bg-slate-800"
                    }`}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={handleResetOfferTest}
              className="rounded-lg border border-amber-500/40 bg-amber-950/60 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-900/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset offer test
            </button>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Sub-status
            </label>
            {activeStage ? (
              <div className="flex flex-wrap gap-2">
                {getStatusesForStage(activeStage).map((status) => {
                  const canonical = getCanonicalStatus(activeStage);
                  const isDefault = status === canonical;
                  const isSelected = activeStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={controlsDisabled}
                      aria-pressed={isSelected}
                      onClick={() => postStatus(status, activeStage)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? "border-purple-400 bg-purple-600 text-white"
                          : "border-slate-700 bg-slate-950 text-slate-300 hover:border-purple-500/60 hover:bg-slate-800"
                      }`}
                    >
                      <span>{status}</span>
                      {isDefault && (
                        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                          default
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No stage selected yet. Set a stage to choose a sub-status.
              </p>
            )}
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={handleNextStage}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next stage
              </button>

              {PRESET_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => postStatus(status)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    activeStatus === status
                      ? "border-purple-500 bg-purple-600 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-200 hover:border-purple-500/60 hover:bg-slate-800"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {successMsg}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Raw status write only. No employee or offer rows are created, no notifications are sent, no hire or offer logic runs.
          </p>
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