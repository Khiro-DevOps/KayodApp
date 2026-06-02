"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { scheduleInterviewProposal } from "../actions";
import type { InterviewType } from "@/lib/types";

interface Application {
  id: string;
  status: string;
  candidate_id: string;
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
  job_postings: { id: string; title: string | null } | null;
}

interface Props {
  application: Application | null;
  error: string | null;
}

export default function ScheduleInterviewClient({ application, error: initialError }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [offeredModes, setOfferedModes] = useState<InterviewType[]>(["online"]);
  const [locationDetails, setLocationDetails] = useState("");

  const allowsInPerson = offeredModes.includes("in_person");

  // "both" = ["online", "in_person"], otherwise exclusive
  const modeSelection: "online" | "in_person" | "both" =
    offeredModes.includes("online") && offeredModes.includes("in_person")
      ? "both"
      : offeredModes[0] === "in_person"
      ? "in_person"
      : "online";

  const selectMode = (choice: "online" | "in_person" | "both") => {
    if (choice === "both") {
      setOfferedModes(["online", "in_person"]);
    } else {
      setOfferedModes([choice]);
      if (choice === "online") setLocationDetails("");
    }
  };

  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(10, 0, 0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  })();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (allowsInPerson && !locationDetails.trim()) {
      setError("Interview address/location details are required when In-Person is enabled.");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData(e.currentTarget);
      formData.append("application_id", application!.id);
      formData.append("job_id", application!.job_postings?.id ?? "");
      offeredModes.forEach((mode) => formData.append("available_modes", mode));
      formData.append("location_details", allowsInPerson ? locationDetails.trim() : "");

      const response = await scheduleInterviewProposal(formData);

      if (response.success) {
        router.push("/hr/interviews");
      } else {
        setError(response.error || "Failed to schedule interview.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const candidateName = application?.profiles
    ? `${application.profiles.first_name ?? ""} ${application.profiles.last_name ?? ""}`.trim() || "Unknown Applicant"
    : "Unknown Applicant";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/hr/interviews"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <div>
          <h1 className="font-h1 text-h1 text-on-surface">Schedule Interview</h1>
          <p className="text-body text-on-surface-variant">Set up an interview for an applicant</p>
        </div>
      </div>

      {/* Error state — no application */}
      {(initialError || !application) && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold mb-1">Unable to load application</p>
          <p>{initialError ?? "No application data found."}</p>
        </div>
      )}

      {application && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Form */}
          <div className="space-y-5">
            {/* Applicant Info Card */}
            <div className="rounded-2xl border border-outline-variant bg-surface p-5">
              <p className="text-label-caps text-on-surface-variant mb-3 uppercase tracking-widest">Applicant</p>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                  {candidateName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-h2 text-h2 text-on-surface">{candidateName}</p>
                  <p className="text-body text-on-surface-variant">{application.profiles?.email ?? "—"}</p>
                  {application.job_postings?.title && (
                    <p className="mt-1 text-label-caps text-on-surface-variant uppercase tracking-wider">
                      {application.job_postings.title}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Schedule Form */}
            <form onSubmit={handleSubmit} className="rounded-2xl border border-outline-variant bg-surface p-5 space-y-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Date & Time */}
              <div className="space-y-2">
                <label htmlFor="scheduled_at" className="block text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">
                  Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  id="scheduled_at"
                  name="scheduled_at"
                  defaultValue={defaultDate}
                  required
                  className="w-full rounded-xl border border-outline-variant bg-background px-4 py-2.5 text-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label htmlFor="duration_minutes" className="block text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">
                  Duration
                </label>
                <select
                  id="duration_minutes"
                  name="duration_minutes"
                  defaultValue="60"
                  className="w-full rounded-xl border border-outline-variant bg-background px-4 py-2.5 text-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
              </div>

              {/* Interview Mode */}
              <div className="space-y-3">
                <div>
                  <p className="text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">Interview Mode</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">Choose a mode. Selecting &ldquo;Both&rdquo; lets the applicant pick their preference.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "online", icon: "videocam", label: "Online", sub: "Video meeting room" },
                    { key: "in_person", icon: "location_on", label: "In-Person", sub: "Office visit" },
                    { key: "both", icon: "switch_access", label: "Both", sub: "Applicant chooses" },
                  ] as const).map(({ key, icon, label, sub }) => {
                    const active = modeSelection === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectMode(key)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-outline-variant bg-background hover:border-primary/40 hover:bg-surface-container"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`material-symbols-outlined text-[16px] ${ active ? "text-primary" : "text-on-surface-variant"}`}>
                            {icon}
                          </span>
                          <p className={`text-h3 font-semibold ${ active ? "text-primary" : "text-on-surface"}`}>{label}</p>
                        </div>
                        <p className="text-xs text-on-surface-variant leading-4">{sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* In-Person Location */}
              {allowsInPerson && (
                <div className="space-y-2">
                  <label htmlFor="location_details" className="block text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">
                    Office / Location Address <span className="text-error">*</span>
                  </label>
                  <textarea
                    id="location_details"
                    name="location_details"
                    value={locationDetails}
                    onChange={(e) => setLocationDetails(e.target.value)}
                    required={allowsInPerson}
                    rows={3}
                    placeholder="e.g. 3rd Floor, Acme Building, Ayala Ave., Makati City. Please check in with reception."
                    className="w-full rounded-xl border border-outline-variant bg-background px-4 py-2.5 text-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
                  />
                </div>
              )}

              {/* Online info banner */}
              {offeredModes.includes("online") && (
                <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                  <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">info</span>
                  <p className="text-xs text-primary">A secure meeting room link will be auto-generated and sent to the applicant.</p>
                </div>
              )}

              {/* Timezone */}
              <div className="space-y-2">
                <label htmlFor="timezone" className="block text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">
                  Timezone
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  defaultValue="Asia/Manila"
                  className="w-full rounded-xl border border-outline-variant bg-background px-4 py-2.5 text-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time (US)</option>
                  <option value="America/Chicago">Central Time (US)</option>
                  <option value="America/Denver">Mountain Time (US)</option>
                  <option value="America/Los_Angeles">Pacific Time (US)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Singapore">Singapore (SGT)</option>
                  <option value="Asia/Bangkok">Bangkok (ICT)</option>
                  <option value="Asia/Manila">Manila (PHT)</option>
                  <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Shanghai (CST)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                  <option value="Australia/Sydney">Sydney (AEDT)</option>
                </select>
              </div>

              {/* Additional Notes */}
              <div className="space-y-2">
                <label htmlFor="notes" className="block text-label-caps font-medium text-on-surface-variant uppercase tracking-wider">
                  Notes <span className="text-on-surface-variant font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="e.g. What to bring, topics to cover, dress code…"
                  className="w-full rounded-xl border border-outline-variant bg-background px-4 py-2.5 text-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-h3 font-semibold text-on-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scheduling…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">event</span>
                      Schedule Interview
                    </>
                  )}
                </button>
                <Link
                  href="/hr/interviews"
                  className="flex items-center justify-center rounded-xl border border-outline-variant bg-surface px-5 py-2.5 text-h3 font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>

          {/* Right sidebar — tips */}
          <aside className="hidden lg:block space-y-4">
            <div className="rounded-2xl border border-outline-variant bg-surface p-5 space-y-4">
              <p className="text-label-caps font-semibold text-on-surface uppercase tracking-wider">What happens next?</p>
              <ol className="space-y-3">
                {[
                  { icon: "send", text: "An interview invitation is sent to the applicant." },
                  { icon: "how_to_reg", text: "Applicant confirms their preferred mode (online or in-person)." },
                  { icon: "event_available", text: "Interview is scheduled and both parties receive details." },
                  { icon: "videocam", text: "For online interviews, a meeting room link is auto-generated." },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-[15px]">{step.icon}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-5 pt-0.5">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container p-4">
              <p className="text-label-caps font-semibold text-on-surface uppercase tracking-wider mb-2">Tip</p>
              <p className="text-xs text-on-surface-variant leading-5">
                Offering both online and in-person options gives applicants flexibility and increases interview acceptance rates.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
