"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BriefcaseBusiness, Mail, Sparkles } from "lucide-react";
import InterviewSchedulingForm from "../../jobs/[id]/applicants/interview-scheduling-form";

interface Application {
  id: string;
  status: string;
  selected_mode: "online" | "in_person" | null;
  hr_office_address: string | null;
  hr_offered_modes: ("online" | "in_person")[] | null;
  candidate_id: string;
  match_score: number | null;
  candidate: { first_name: string; last_name: string; email: string; };
  job: { id: string; title: string; };
}

export default function InterviewSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationIdParam = searchParams.get("applicationId") ?? searchParams.get("application_id");

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!applicationIdParam) {
        console.error("[InterviewSchedulePage] Cannot load schedule form: applicationId is missing", {
          path: window.location.pathname,
          query: window.location.search,
          expectedParameter: "applicationId",
        });
        setError("Missing application ID. Open scheduling from an applicant record.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: application, error } = await supabase
        .from("job_applications")
        .select("*, job:job_postings(*), candidate:profiles(*)")
        .eq("id", applicationIdParam)
        .single();

      if (error || !application) {
        if (error) {
          console.error("[InterviewSchedulePage] Application query failed", {
            applicationId: applicationIdParam,
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          });
          setError(`Unable to load application ${applicationIdParam}: ${error.message}`);
        } else {
          console.error("[InterviewSchedulePage] Application query returned no row", {
            applicationId: applicationIdParam,
            reason: "No job_applications row matched the requested id or the current user cannot access it",
          });
          setError(`Application ${applicationIdParam} was not found or you do not have access to it.`);
        }
        setLoading(false);
        return;
      }

      setApplication(application as unknown as Application);
      setLoading(false);
    }
    load();
  }, [applicationIdParam, router]);

  return (
    <div className="w-full px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {loading ? (
          <div className="rounded-3xl border border-border/60 bg-card p-8 text-sm text-text-secondary shadow-sm">Loading applicant...</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">{error}</div>
        ) : application ? (
          <main className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">Interview setup</p>
              <h1 className="mt-2 font-h1 text-3xl font-semibold tracking-tight text-text-primary">Schedule Interview</h1>
              <p className="mt-2 text-sm text-text-secondary">
                Set up availability and format for {application.candidate.first_name} {application.candidate.last_name} applying for {application.job.title}.
              </p>
            </header>

            <div className="my-8 flex flex-col gap-5 border-y border-border/60 py-6 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-primary/10 bg-primary-light text-xl font-semibold text-primary ring-1 ring-primary/20">
                {application.candidate.first_name[0]}{application.candidate.last_name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-text-primary">
                  {application.candidate.first_name} {application.candidate.last_name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3 py-1.5 text-xs font-semibold text-primary">
                    <BriefcaseBusiness className="h-3.5 w-3.5" />
                    {application.job.title}
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
                    <Mail className="h-4 w-4" />
                    <span className="break-all">{application.candidate.email}</span>
                  </span>
                </div>
              </div>
              {application.match_score !== null && application.match_score !== undefined && (
                <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-success-bg px-3 py-3 text-sm font-semibold text-green-700">
                  <Sparkles className="h-4 w-4" />
                  {Math.round(Number(application.match_score))}% Match
                </div>
              )}
            </div>

            <InterviewSchedulingForm
              applicationId={application.id}
              jobId={application.job.id}
              onSuccess={() => router.push("/hr/interviews")}
              onCancel={() => router.push("/hr/interviews")}
            />
          </main>
        ) : null}
      </div>
    </div>
  );
}