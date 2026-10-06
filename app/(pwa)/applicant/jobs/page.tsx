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
import ApplicantJobsClient from "./jobs-client";

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
  if (isHR) redirect("/hr/jobs");

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

  // Fetch candidate application statuses for all jobs shown
  const { data: userApplications } = await supabase
    .from("applications")
    .select("job_posting_id, match_score")
    .eq("candidate_id", user.id);

  const applicationsMap: Record<string, { hasApplied: boolean; matchScore: number | null }> = {};
  if (userApplications) {
    for (const app of userApplications) {
      applicationsMap[app.job_posting_id] = {
        hasApplied: true,
        matchScore: app.match_score as number | null,
      };
    }
  }

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  const isCandidate = (profile?.role ?? authRole ?? "candidate") === "candidate";

  const hasResume = (resumes?.length ?? 0) > 0;

  if (!hasResume) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center p-6 md:p-8 text-center bg-white border border-gray-200 rounded-2xl space-y-4 shadow-sm min-w-0">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[32px]">description</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 w-full text-center block whitespace-normal break-words">
            Unlock AI-Matched Job Opportunities
          </h2>
          <p className="w-full text-center block text-sm md:text-base leading-relaxed text-muted-foreground whitespace-normal break-words">
            You haven&apos;t added a resume yet. Build a tailored resume in minutes using our AI builder or upload your existing PDF to view and apply for jobs.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full justify-center">
            <Link
              href="/applicant/resume"
              className="bg-[#1F195E] text-white px-6 py-3 rounded-xl font-medium text-sm text-center flex items-center justify-center gap-2 hover:bg-[#1F195E]/90 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              Build Resume with AI
            </Link>
            <Link
              href="/applicant/resume"
              className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-medium text-sm text-center flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              Upload PDF Resume
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 space-y-8">
      <section className="bg-white rounded-xl border border-outline-variant p-6 md:p-8 shadow-xs">
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
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
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
                className="w-1/2 bg-surface border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
                placeholder="Min"
                type="number"
              />
              <input
                name="payMax"
                defaultValue={payMax ?? ""}
                className="w-1/2 bg-surface border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
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
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
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
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 appearance-none focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-body-md"
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

          <button type="submit" className="md:col-span-4 w-full bg-primary text-on-primary py-3.5 rounded-xl font-headline-sm text-headline-sm hover:opacity-95 transition-all shadow-xs">
            Show matches
          </button>
        </form>
      </section>

      <ApplicantJobsClient
        recommendedJobs={recommendedJobs}
        allJobs={allJobs}
        selectedResumeTitle={selectedResume?.title ?? undefined}
        applicationsMap={applicationsMap}
        isCandidate={isCandidate}
      />
    </div>
  );
}