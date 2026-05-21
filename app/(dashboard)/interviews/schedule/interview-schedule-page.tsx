"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import InterviewSchedulingForm from "../../jobs/manage/[id]/applicants/interview-scheduling-form";

interface Application {
  id: string;
  status: string;
  selected_mode: "online" | "in_person" | null;
  hr_office_address: string | null;
  hr_offered_modes: ("online" | "in_person")[] | null;
  candidate_id: string;
  profiles: { first_name: string; last_name: string; email: string; };
  job_postings: { id: string; title: string; };
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
        setError("Missing application ID. Open this page from an applicant card.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("applications")
        .select(`id, status, selected_mode, hr_office_address, hr_offered_modes, candidate_id, profiles!applications_candidate_id_fkey ( first_name, last_name, email ), job_postings ( id, title )`)
        .eq("id", applicationIdParam)
        .maybeSingle();

      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      if (data) {
        setApplication(data as unknown as Application);
      } else {
        setError("Application not found or you do not have access to it.");
      }
      setLoading(false);
    }
    load();
  }, [applicationIdParam]);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/interviews" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-text-primary">Schedule Interview</h1>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-border p-4 text-sm text-text-secondary">Loading applicant…</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : application ? (
          <>
            <div className="rounded-2xl bg-surface border border-border p-4 space-y-1">
              <p className="text-xs font-medium text-text-secondary">Applicant</p>
              <p className="text-sm font-semibold text-text-primary">
                {application.profiles.first_name} {application.profiles.last_name}
              </p>
              <p className="text-xs text-text-secondary">{application.profiles.email}</p>
              <p className="pt-1 text-xs text-text-secondary">{application.job_postings.title}</p>
            </div>

            <InterviewSchedulingForm
              applicationId={application.id}
              jobId={application.job_postings.id}
              onSuccess={() => router.push("/interviews")}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}