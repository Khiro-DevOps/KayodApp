// ============================================================
// SAVE THIS AS: app/(dashboard)/jobs/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { JobPosting, Profile, Resume } from "@/lib/types";
import { computeMatchScore, calculateCompatibilityScore, calculateWeightedMatchScore } from "@/lib/match-score";
import { analyzeJobFit, type JobFitAnalysisOutput } from "@/lib/gemini";
import Link from "next/link";
import { JOB_INDUSTRIES, PHILIPPINE_CITIES } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ resume_id?: string; payMin?: string; payMax?: string; location?: string; work_setup?: string }>;
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

function formatSalaryRange(job: JobPosting): string | null {
  const minValue = typeof job.salary_min === "number" ? job.salary_min : null;
  const maxValue = typeof job.salary_max === "number" ? job.salary_max : null;

  if (minValue === null && maxValue === null) return null;
  if (minValue !== null && maxValue !== null) {
    return `₱${minValue.toLocaleString()} - ₱${maxValue.toLocaleString()}`;
  }

  if (minValue !== null) {
    return `From ₱${minValue.toLocaleString()}`;
  }

  return `Up to ₱${maxValue?.toLocaleString()}`;
}

function formatWorkSetup(workSetup: JobPosting["work_setup"]): string {
  if (workSetup === "remote" || workSetup === "wfh") return "Remote / WFH";
  if (workSetup === "hybrid") return "Hybrid";
  return "Onsite";
}

function formatEmploymentType(employmentType: JobPosting["employment_type"]): string {
  return employmentType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatIndustry(industry: string | null): string | null {
  if (!industry) return null;

  return JOB_INDUSTRIES.find((item) => item.id === industry)?.label ?? industry;
}

export default async function JobsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { resume_id: resumeId, payMin: payMinStr, payMax: payMaxStr, location, work_setup } = await searchParams;

  const payMin = payMinStr ? parseInt(payMinStr) : null;
  const payMax = payMaxStr ? parseInt(payMaxStr) : null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, city_id, province_id")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "city_id" | "province_id">>();

  const isHR = profile?.role === "hr_manager" || profile?.role === "admin";
  if (isHR) redirect("/hr/jobs/manage");

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

  if (work_setup && work_setup !== "") {
    query = query.eq("work_setup", work_setup);
  }

  const { data: jobs } = await query.order("created_at", { ascending: false });
  const filteredJobs = (jobs ?? []).filter((job) => filterByPayRange(job as JobPosting, payMin, payMax));
  const resumeText = selectedResume ? buildResumeText(selectedResume) : "";

  const shortlistedJobs: Array<{ job: JobPosting; score: number }> = selectedResume
    ? filteredJobs.map((job) => {
      const j = job as JobPosting;
      const semanticScore = computeMatchScore(resumeText, {
        title: j.title,
        description: j.description,
        requirements: j.requirements,
        required_skills: j.required_skills ?? [],
      });
      const compatibilityScore = calculateCompatibilityScore(
        j.work_setup,
        j.city_id,
        j.province_id,
        profile?.city_id,
        profile?.province_id,
        work_setup
      );
      const score = calculateWeightedMatchScore(semanticScore, compatibilityScore);

      return {
        job: j,
        score,
      };
    })
    : [];

  const recommendedJobs = selectedResume
    ? await Promise.all(
      shortlistedJobs
        .filter((item) => item.score >= 25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(async ({ job, score }) => {
          try {
            return {
              job,
              fit: await analyzeJobFit({
                resumeData: resumeText,
                jobRequirements: {
                  title: job.title,
                  description: job.description,
                  requirements: job.requirements,
                  required_skills: job.required_skills ?? [],
                  industry: job.industry,
                  job_category: job.job_category,
                  employment_type: job.employment_type,
                },
                fallbackScore: score,
              }),
            };
          } catch (e) {
            console.error(`AI Analysis failed for job ${job.id}, using UI-level fallback:`, e);
            return {
              job,
              fit: {
                fit_score: 75,
                match_level: "High" as const,
                top_reasons: ["Good alignment with your profile"],
                gap_analysis: "Stitch was able to find a likely match based on your saved resume data.",
                card_color_hex: "#7C7AAC",
                is_fallback: true
              }
            };
          }
        })
    )
    : [];
  const allJobs: JobPosting[] = selectedResume
    ? [...shortlistedJobs].sort((a, b) => b.score - a.score).map((s) => s.job)
    : (filteredJobs as JobPosting[]);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 space-y-8">
      <section className="bg-white rounded-card border border-outline-variant p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">AI Recommended Jobs</h2>
          <p className="text-body-sm text-on-surface-variant">We match your resume skills and salary expectations with current market openings.</p>
        </div>

        <form method="get" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="space-y-2">
            <label className="text-label-caps font-label-caps text-on-surface-variant ml-1">Resume</label>
            <div className="relative">
              <select
                name="resume_id"
                defaultValue={selectedResume?.id ?? ""}
                className="w-full bg-surface border border-border rounded-card px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
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
              <span className="material-symbols-outlined absolute right-3 top-3.5 text-outline pointer-events-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>expand_more</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-label-caps font-label-caps text-on-surface-variant ml-1">Salary Range (Monthly)</label>
            <div className="flex items-center gap-2">
              <input
                name="payMin"
                defaultValue={payMin ?? ""}
                className="w-1/2 bg-surface border border-border rounded-card px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
                placeholder="Min"
                type="number"
              />
              <input
                name="payMax"
                defaultValue={payMax ?? ""}
                className="w-1/2 bg-surface border border-border rounded-card px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
                placeholder="Max"
                type="number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-label-caps font-label-caps text-on-surface-variant ml-1">Location</label>
            <div className="relative">
              <select
                name="location"
                defaultValue={location ?? "all"}
                className="w-full bg-surface border border-border rounded-card px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
              >
                <option value="all">All Locations</option>
                {PHILIPPINE_CITIES.map((city, index) => (
                  <option key={`${city}-${index}`} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-3.5 text-outline pointer-events-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>location_on</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-label-caps font-label-caps text-on-surface-variant ml-1">Work Setup</label>
            <div className="relative">
              <select
                name="work_setup"
                defaultValue={work_setup ?? ""}
                className="w-full bg-surface border border-border rounded-card px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
              >
                <option value="">Any Setup</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
                <option value="wfh">WFH</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-3.5 text-outline pointer-events-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>work</span>
            </div>
          </div>

          <button type="submit" className="md:col-span-4 w-full bg-primary text-on-primary py-4 rounded-xl font-headline-sm text-headline-sm hover:opacity-95 transition-all shadow-md">
            Show matches
          </button>
        </form>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-headline-sm font-headline-sm text-on-surface">Jobs For You</h2>
            <p className="text-body-sm text-on-surface-variant">Based on {selectedResume?.title ?? "your experience"}</p>
          </div>
          {selectedResume && (
            <div className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-caps font-label-caps flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Selected resume
            </div>
          )}
        </div>

        {selectedResume && recommendedJobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recommendedJobs.map(({ job, fit }) => (
              <RecommendedJobCard key={job.id} job={job} fit={fit} />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-outline-variant p-8 text-center bg-surface">
            <p className="text-body-sm text-on-surface-variant">No recommended jobs matching your criteria.</p>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-headline-sm font-headline-sm text-on-surface">All Jobs</h2>
          <span className="bg-surface-container-highest text-primary px-3 py-0.5 rounded-full text-label-caps font-label-caps">
            {allJobs.length} openings
          </span>
        </div>

        <div className="space-y-4">
          {allJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RecommendedJobCard({ job, fit }: { job: JobPosting; fit: JobFitAnalysisOutput }) {
  const dept = job.departments as unknown as { name: string } | null;
  const salaryRange = formatSalaryRange(job);

  return (
    <article className="bg-white border border-outline-variant rounded-card p-6 job-card-hover cursor-pointer group relative">
      <Link href={`/jobs/${job.id}`} className="absolute inset-0 z-10" />
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[32px]">analytics</span>
        </div>
        <div
          className="px-3 py-1 rounded-full text-label-caps font-label-caps"
          style={{ backgroundColor: `${fit.card_color_hex}18`, color: fit.card_color_hex }}
        >
          {(fit as any).is_fallback ? "ANALYSIS PENDING" : `${fit.match_level} ${fit.fit_score}%`}
        </div>
      </div>
      <h3 className="text-title-lg font-title-lg text-on-surface group-hover:text-primary transition-colors">
        {job.title}
      </h3>
      <p className="text-body-sm text-on-surface-variant font-medium mb-3">
        {dept?.name ?? "General"}{job.job_category && ` • ${job.job_category}`}
      </p>
      <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-6">
        {fit.top_reasons[0]}
      </p>
      <div className="flex flex-wrap gap-3">
        {job.location && (
          <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
            <span className="material-symbols-outlined text-[18px]">location_on</span> {job.location}
          </div>
        )}
        {salaryRange && (
          <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
            <span className="material-symbols-outlined text-[18px]">payments</span> {salaryRange}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
          <span className="material-symbols-outlined text-[18px]">home_work</span> {formatWorkSetup(job.work_setup)}
        </div>
        <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg">
          <span className="material-symbols-outlined text-[18px]">schedule</span> {formatEmploymentType(job.employment_type)}
        </div>
      </div>
    </article>
  );
}

function JobCard({ job }: { job: JobPosting }) {
  const salaryRange = formatSalaryRange(job);

  return (
    <div className="bg-white border border-outline-variant rounded-card p-6 job-card-hover flex flex-col md:flex-row gap-6 group relative">
      <Link href={`/jobs/${job.id}`} className="absolute inset-0 z-10" />
      <div className="flex-shrink-0">
        <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[40px]">monitoring</span>
        </div>
      </div>
      <div className="flex-grow space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <h3 className="text-title-lg font-title-lg text-on-surface group-hover:text-primary transition-colors">
            {job.title}
          </h3>
          <span className="text-label-caps font-label-caps text-on-surface-variant">
            Posted {new Date(job.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className="flex flex-wrap gap-4">
          {job.location && (
            <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">location_on</span> {job.location}
            </div>
          )}
          {salaryRange && (
            <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">payments</span> {salaryRange}
            </div>
          )}
          <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">home_work</span> {formatWorkSetup(job.work_setup)}
          </div>
        </div>
        <p className="text-body-sm text-on-surface-variant line-clamp-2">
          {job.description}
        </p>
      </div>
      <div className="flex items-center relative z-20">
        <Link
          href={`/jobs/${job.id}`}
          className="w-full md:w-auto border border-primary text-primary px-8 py-2 rounded-full font-label-caps text-label-caps hover:bg-primary hover:text-on-primary transition-all text-center"
        >
          View Details
        </Link>
      </div>
    </div>
  );
}