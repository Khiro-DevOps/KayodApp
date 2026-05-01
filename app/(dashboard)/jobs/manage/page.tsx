// ============================================================
// SAVE THIS AS: app/(dashboard)/jobs/manage/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobPosting, Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, isHRRole } from "@/lib/roles";

export default async function ManageJobsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole =
    (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role">>();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
  }

  const role = effectiveRole(profile?.role, authRole);
  const isHR = isHRRole(role);
  if (!isHR) {
    console.log("User role is not HR:", role);
    redirect("/dashboard");
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("job_postings")
    .select("*, departments(name)")
    .order("created_at", { ascending: false });

  if (jobsError) {
    console.error("Jobs fetch error:", jobsError);
  }

  // Get applicant counts per job (using only job_posting_id)
  const jobIds = jobs?.map((j) => j.id) ?? [];
  let appCounts: any[] = [];
  let countError: string | null = null;

  if (jobIds.length) {
    const { data, error: countErr } = await supabase
      .from("applications")
      .select("job_posting_id")
      .in("job_posting_id", jobIds as string[]);

    if (countErr) {
      countError = `Failed to fetch applicant counts: ${countErr.message}`;
      console.error(countError);
    } else {
      appCounts = data ?? [];
    }
  }

  const countMap: Record<string, number> = {};

if (jobIds.length) {
  const { data: counts, error: countError } = await supabase
    .from("applications")
    .select("job_posting_id")
    .in("job_posting_id", jobIds as string[]);

  if (countError) console.error("Count error:", countError);

  counts?.forEach((a) => {
    if (!a.job_posting_id) return;
    countMap[a.job_posting_id] = (countMap[a.job_posting_id] ?? 0) + 1;
  });
}
  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Manage Jobs
          </h1>
          <Link
            href="/jobs/manage/new"
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            + New Job
          </Link>
        </div>

        {countError && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-900 font-medium">Error loading applicant counts:</p>
            <p className="text-sm text-red-700 mt-1 font-mono">{countError}</p>
          </div>
        )}

        {!jobs || jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
            <p className="text-sm text-text-secondary">
              No job postings yet
            </p>
            <Link
              href="/jobs/manage/new"
              className="inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Post Your First Job
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(jobs as JobPosting[]).map((job) => {
              const dept = job.departments as unknown as { name: string } | null;
              const applicantCount = countMap[job.id] ?? 0;

              return (
                <Link
                  key={job.id}
                  href={`/jobs/manage/${job.id}`}
                  className="block rounded-2xl bg-surface border border-border p-4 space-y-2 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-text-primary text-sm truncate">
                        {job.title}
                      </h3>
                      <p className="text-xs text-text-secondary">
                        {dept?.name ?? "General"} · {job.employment_type.replace("_", " ")}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      job.is_published
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-text-secondary"
                    }`}>
                      {job.is_published ? "Published" : "Draft"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                    {job.location && <span>📍 {job.location}</span>}
                    {job.salary_min && job.salary_max && (
                      <span>₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}</span>
                    )}
                    <span className={`font-medium ${applicantCount > 0 ? "text-primary" : ""}`}>
                      {applicantCount} applicant{applicantCount !== 1 ? "s" : ""}
                    </span>
                    <span>{job.slots} slot{job.slots !== 1 ? "s" : ""}</span>
                  </div>

                  <p className="text-xs text-text-tertiary">
                    Posted {new Date(job.created_at).toLocaleDateString("en-PH", {
                      month: "short", day: "numeric", year: "numeric"
                    })}
                    {job.closes_at && ` · Closes ${new Date(job.closes_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}