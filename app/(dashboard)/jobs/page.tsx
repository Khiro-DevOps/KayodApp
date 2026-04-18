// ============================================================
// SAVE THIS AS: app/(dashboard)/jobs/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { JobPosting, Profile, Resume } from "@/lib/types";
import { computeMatchScore } from "@/lib/match-score";
import Link from "next/link";
import { PHILIPPINE_CITIES } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ resume_id?: string; payMin?: string; payMax?: string; location?: string }>;
}

function filterByPayRange(job: JobPosting, payMin: number | null, payMax: number | null) {
  if (payMin === null && payMax === null) return true;
  if (!job.salary_min && !job.salary_max) return false;

  const minValue = typeof job.salary_min === "number" ? job.salary_min : null;
  const maxValue = typeof job.salary_max === "number" ? job.salary_max : null;

  if (payMin !== null && payMax !== null) {
    return (
      (minValue !== null && minValue >= payMin && minValue <= payMax) ||
      (maxValue !== null && maxValue >= payMin && maxValue <= payMax) ||
      (minValue !== null && maxValue !== null && payMin >= minValue && payMin <= maxValue)
    );
  }

  if (payMin !== null) {
    return (minValue !== null && minValue >= payMin) || (maxValue !== null && maxValue >= payMin);
  }

  if (payMax !== null) {
    return (minValue !== null && minValue <= payMax) || (maxValue !== null && maxValue <= payMax);
  }

  return true;
}

function buildResumeText(resume: Resume): string {
  if (resume.content_text && resume.content_text.trim()) {
    return resume.content_text;
  }

  const inputData = resume.input_data as Record<string, unknown> | undefined;
  if (!inputData) return "";

  const pieces: string[] = [];
  if (typeof inputData.summary === "string") pieces.push(inputData.summary);
  if (typeof inputData.experience === "string") pieces.push(inputData.experience);
  if (typeof inputData.education === "string") pieces.push(inputData.education);
  if (Array.isArray(inputData.skills)) pieces.push(inputData.skills.join(" "));
  if (Array.isArray(inputData.certifications)) pieces.push(inputData.certifications.join(" "));
  if (typeof inputData.personal_info === "object" && inputData.personal_info !== null) {
    const personal = inputData.personal_info as Record<string, unknown>;
    if (typeof personal.full_name === "string") pieces.push(personal.full_name);
    if (typeof personal.location === "string") pieces.push(personal.location);
  }

  return pieces.join(" ");
}

export default async function JobsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { resume_id: resumeId, payMin: payMinStr, payMax: payMaxStr, location } = await searchParams;

  const payMin = payMinStr ? parseInt(payMinStr) : null;
  const payMax = payMaxStr ? parseInt(payMaxStr) : null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (isHR) redirect("/jobs/manage");

  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  const selectedResume = (resumeId
    ? resumes?.find((resume) => resume.id === resumeId)
    : resumes?.[0]) ?? null;

  let query = supabase
    .from("job_postings")
    .select("*, departments(name)")
    .eq("is_published", true);

  if (location && location !== "all") {
    query = query.eq("location", location);
  }

  const { data: jobs } = await query.order("created_at", { ascending: false });
  const filteredJobs = (jobs ?? []).filter((job) => filterByPayRange(job as JobPosting, payMin, payMax));
  const resumeText = selectedResume ? buildResumeText(selectedResume) : "";

  const jobsWithScore = selectedResume
    ? filteredJobs.map((job) => ({
        job: job as JobPosting,
        score: computeMatchScore(resumeText, {
          title: (job as JobPosting).title,
          description: (job as JobPosting).description,
          requirements: (job as JobPosting).requirements,
          required_skills: (job as JobPosting).required_skills ?? [],
        }),
      }))
    : [];

  const recommendedJobs = selectedResume
    ? jobsWithScore
        .filter((item) => item.score >= 25)
        .sort((a, b) => b.score - a.score)
    : [];

  const allJobs = filteredJobs as JobPosting[];

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            AI Recommended Jobs
          </h1>
          <p className="text-sm text-text-secondary max-w-2xl">
            Pick a resume and salary range to discover jobs matched to your experience. Your selected resume powers the “Jobs For You” recommendations.
          </p>
        </div>

        <form method="get" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary uppercase">Resume</label>
            <select
              name="resume_id"
              defaultValue={selectedResume?.id ?? ""}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
            >
              {resumes && resumes.length > 0 ? (
                resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title || new Date(resume.created_at).toLocaleDateString()}
                  </option>
                ))
              ) : (
                <option value="">No resumes available</option>
              )}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary uppercase">Salary Range</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  name="payMin"
                  placeholder="Min"
                  defaultValue={payMin ?? ""}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center text-text-secondary">-</div>
              <div className="flex-1">
                <input
                  type="number"
                  name="payMax"
                  placeholder="Max"
                  defaultValue={payMax ?? ""}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary uppercase">Location</label>
            <select
              name="location"
              defaultValue={location ?? "all"}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="all">All Locations</option>
              {PHILIPPINE_CITIES.map((city, index) => (
                <option key={`${city}-${index}`} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="md:col-span-3 rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Show matches
          </button>
        </form>

        {resumes && resumes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary mb-4">
              You don’t have any resumes yet. Create one to get personalized job recommendations.
            </p>
            <Link
              href="/resume/create"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Create your first resume
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Jobs For You</h2>
                  <p className="text-sm text-text-secondary">
                    Based on {selectedResume?.title ?? "your selected resume"}.
                  </p>
                </div>
                {selectedResume && (
                  <div className="rounded-full bg-primary/5 px-4 py-2 text-xs font-medium text-primary">
                    Selected resume: {selectedResume.title}
                  </div>
                )}
              </div>

              {selectedResume && recommendedJobs.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {recommendedJobs.map(({ job, score }) => (
                    <RecommendedJobCard key={job.id} job={job} score={score} />
                  ))}
                </div>
              ) : selectedResume ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-text-secondary mb-4">
                    No recommended jobs found for this resume and salary range.
                  </p>
                  <p className="text-sm text-text-secondary">
                    Try a different resume, widen the pay range, or browse all available jobs below.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">All jobs</h2>
                  <p className="text-sm text-text-secondary">Browse all published openings that match your filters.</p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-text-secondary">
                  {allJobs.length} openings
                </span>
              </div>

              {allJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-text-secondary">
                    No jobs match your filters. Remove the pay filter or location filter to see more roles.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allJobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function RecommendedJobCard({ job, score }: { job: JobPosting; score: number }) {
  const dept = job.departments as unknown as { name: string } | null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-2xl bg-surface border border-border p-4 space-y-2 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-text-primary text-sm truncate">
            {job.title}
          </h3>
          <p className="text-xs text-text-secondary">
            {dept?.name ?? "General"}
            {job.job_category && ` • ${job.job_category}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {score}% match
        </span>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2">
        {job.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {job.location && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            📍 {job.location}
            {job.is_remote && " (Remote)"}
          </span>
        )}
        {job.salary_min && job.salary_max && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
          </span>
        )}
        {job.required_skills?.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {skill}
          </span>
        ))}
      </div>

      <p className="text-xs text-text-tertiary">
        Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        {job.closes_at && ` · Closes ${new Date(job.closes_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
      </p>
    </Link>
  );
}

function JobCard({ job }: { job: JobPosting }) {
  const dept = job.departments as unknown as { name: string } | null;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-2xl bg-surface border border-border p-4 space-y-2 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-text-primary text-sm truncate">
            {job.title}
          </h3>
          <p className="text-xs text-text-secondary">
            {dept?.name ?? "General"}
            {job.job_category && ` • ${job.job_category}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 capitalize">
          {job.employment_type.replace("_", " ")}
        </span>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2">
        {job.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {job.location && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            📍 {job.location}
            {job.is_remote && " (Remote)"}
          </span>
        )}
        {job.salary_min && job.salary_max && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
            ₱{job.salary_min.toLocaleString()} – ₱{job.salary_max.toLocaleString()}
          </span>
        )}
        {job.required_skills?.slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {skill}
          </span>
        ))}
      </div>

      <p className="text-xs text-text-tertiary">
        Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        {job.closes_at && ` · Closes ${new Date(job.closes_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
      </p>
    </Link>
  );
}
