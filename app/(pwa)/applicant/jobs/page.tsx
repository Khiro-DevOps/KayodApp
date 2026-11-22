// ============================================================
// SAVE THIS AS: app/(dashboard)/jobs/page.tsx
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import type { JobPosting, Profile, Resume } from "@/lib/types";
import {
  computeCanonicalJobMatch,
  getDisplayMatchScore,
  persistBatchCanonicalMatchCache,
  type CanonicalMatchResult,
} from "@/lib/match-scoring";
import { type JobFitAnalysisOutput } from "@/lib/gemini";
import Link from "next/link";
import { JOB_INDUSTRIES } from "@/lib/constants";
import ApplicantJobsClient from "./jobs-client";
import JobsFilterBar from "./jobs-filter-bar";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";

interface Props {
  searchParams: Promise<{ resume_id?: string; payMin?: string; payMax?: string; location?: string; work_setup?: string; q?: string }>;
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
  const { resume_id: resumeId, payMin: payMinStr, payMax: payMaxStr, location, work_setup, q } = await searchParams;
  const searchQuery = q?.trim() ?? "";

  const payMin = payMinStr ? parseInt(payMinStr) : null;
  const payMax = payMaxStr ? parseInt(payMaxStr) : null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, city_id, province_id, work_setup, city")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "city_id" | "province_id" | "work_setup" | "city">>();

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
    .select("*, departments(name), tenant:tenants(name)")
    .eq("is_published", true);

  if (location && location !== "all") {
    query = query.eq("location", location);
  }

  if (work_setup && work_setup !== "") {
    query = query.eq("work_setup", work_setup);
  }

  const { data: jobs } = await query.order("created_at", { ascending: false });

  // Server-side admin lookup for tenant names (bypasses tenants RLS for applicants)
  const tenantMap = new Map<string, string>();
  const creatorTenantMap = new Map<string, string>();

  try {
    const admin = getAdminClient();
    const rawJobs = (jobs ?? []) as Array<JobPosting & { created_by?: string | null }>;
    const creatorIds = Array.from(
      new Set(
        rawJobs
          .filter((j) => !j.tenant_id && j.created_by)
          .map((j) => j.created_by as string)
      )
    );

    if (creatorIds.length > 0) {
      const { data: creatorProfiles } = await admin
        .from("profiles")
        .select("id, tenant_id")
        .in("id", creatorIds);

      for (const cp of creatorProfiles ?? []) {
        if (cp.tenant_id) {
          creatorTenantMap.set(cp.id, cp.tenant_id);
        }
      }
    }

    const tenantIds = Array.from(
      new Set([
        ...rawJobs.map((j) => j.tenant_id).filter((id): id is string => Boolean(id)),
        ...Array.from(creatorTenantMap.values()),
      ])
    );

    if (tenantIds.length > 0) {
      const { data: tenants } = await admin
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds);

      for (const t of tenants ?? []) {
        if (t.name?.trim()) {
          tenantMap.set(t.id, t.name.trim());
        }
      }
    }
  } catch (err) {
    console.error("ApplicantJobsPage tenant lookup error:", err);
  }

  const normalizedQuery = searchQuery.toLowerCase();
  const jobsWithCompany = (jobs ?? []).map((rawJob) => {
    const job = rawJob as JobPosting & { created_by?: string | null };
    const tenantRel = Array.isArray(job.tenant) ? job.tenant[0] : job.tenant;
    const creatorTenantId = job.created_by ? creatorTenantMap.get(job.created_by) : undefined;
    const companyName =
      tenantRel?.name?.trim() ||
      (job.tenant_id ? tenantMap.get(job.tenant_id) : undefined) ||
      (creatorTenantId ? tenantMap.get(creatorTenantId) : undefined) ||
      "Company";
    return {
      ...job,
      companyName,
    };
  });
  const filteredJobs = jobsWithCompany.filter((job) => {
    if (!filterByPayRange(job, payMin, payMax)) return false;
    if (!normalizedQuery) return true;
    const haystack = `${job.title ?? ""} ${job.companyName ?? ""} ${job.description ?? ""} ${job.location ?? ""} ${job.job_category ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const resumeText = selectedResume ? buildResumeText(selectedResume) : "";

  // Fetch candidate application statuses for all jobs shown from canonical table
  const { data: userApplications } = await supabase
    .from("job_applications")
    .select("job_id, match_score")
    .eq("applicant_id", user.id);

  const applicationsMap: Record<string, { hasApplied: boolean; matchScore: number | null }> = {};
  if (userApplications) {
    for (const app of userApplications) {
      if (app.job_id) {
        applicationsMap[app.job_id] = {
          hasApplied: true,
          matchScore: app.match_score as number | null,
        };
      }
    }
  }

  const scoredJobs: Array<{ job: JobPosting; score: number; matchResult: CanonicalMatchResult }> = selectedResume
    ? filteredJobs.map((job) => {
        const j = job as JobPosting;
        const matchResult = computeCanonicalJobMatch({
          resume: selectedResume,
          job: j,
          candidate: {
            city_id: profile?.city_id ?? null,
            province_id: profile?.province_id ?? null,
            preferred_work_setup: work_setup || profile?.work_setup || null,
            location: profile?.city ?? null,
          },
        });

        const appliedInfo = applicationsMap[j.id];
        const effectiveScore =
          appliedInfo?.hasApplied && typeof appliedInfo.matchScore === "number" && appliedInfo.matchScore > 0
            ? Math.round(Number(appliedInfo.matchScore))
            : matchResult.score;

        return {
          job: j,
          score: effectiveScore,
          matchResult,
        };
      })
    : [];

  // Persist canonical match scores in background cache for zero discrepancy on application
  if (selectedResume && scoredJobs.length > 0) {
    void persistBatchCanonicalMatchCache(
      user.id,
      scoredJobs.map((item) => ({ jobId: item.job.id, result: item.matchResult }))
    );
  }

  const jobScoresMap: Record<string, number> = {};
  for (const item of scoredJobs) {
    jobScoresMap[item.job.id] = item.score;
  }

  // "Jobs For You · Top Matches" strictly shows roles with score >= 50, sorted descending
  const recommendedJobs: Array<{ job: JobPosting; fit: JobFitAnalysisOutput }> = selectedResume
    ? scoredJobs
        .filter((item) => item.score >= 50)
        .sort((a, b) => b.score - a.score)
        .map(({ job, score, matchResult }) => {
          const appliedInfo = applicationsMap[job.id];
          const isApplied = Boolean(appliedInfo?.hasApplied);
          const displayScore = getDisplayMatchScore({
            applied: isApplied,
            stored: appliedInfo?.matchScore ?? null,
            estimate: score,
          });
          return {
            job,
            fit: {
              fit_score: displayScore.value ?? score,
              match_level: matchResult.match_level,
              top_reasons: matchResult.top_reasons,
              gap_analysis: matchResult.gap_analysis,
              card_color_hex: matchResult.card_color_hex,
            },
          };
        })
    : [];
  const allJobs: JobPosting[] = selectedResume
    ? [...scoredJobs].sort((a, b) => b.score - a.score).map((s) => s.job)
    : (filteredJobs as JobPosting[]);

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
    <div className="space-y-6">
      <PwaHeroBanner
        title="Browse Jobs"
        subtitle="Explore open roles matched to your resume and skills"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Top Matches</p>
            <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{recommendedJobs.length}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
            <p className="text-xs font-medium text-slate-500">All Open Roles</p>
            <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{allJobs.length}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm sm:col-span-1">
            <p className="text-xs font-medium text-slate-500">Active Resume</p>
            <p className="mt-1 truncate text-sm font-bold text-[#1E1B4B] sm:text-base">
              {selectedResume?.title || "Default Resume"}
            </p>
          </div>
        </div>
      </PwaHeroBanner>

      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 sm:px-6 lg:px-10">
        <JobsFilterBar
          resumes={(resumes ?? []).map((r) => ({ id: r.id, title: r.title, created_at: r.created_at }))}
          selectedResumeId={selectedResume?.id ?? ""}
          initialQuery={searchQuery}
          initialPayMin={payMin}
          initialPayMax={payMax}
          initialLocation={location ?? "all"}
          initialWorkSetup={work_setup ?? ""}
        />

        <ApplicantJobsClient
          recommendedJobs={recommendedJobs}
          allJobs={allJobs}
          jobScoresMap={jobScoresMap}
          selectedResumeTitle={selectedResume?.title ?? undefined}
          applicationsMap={applicationsMap}
          isCandidate={isCandidate}
        />
      </div>
    </div>
  );
}
