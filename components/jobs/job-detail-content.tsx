"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Calendar, CheckCircle2, MapPin, Wallet, Briefcase, Laptop, X } from "lucide-react";
import type { JobPosting, Resume } from "@/lib/types";
import {
  computeCompensationTotals,
  parseCompensationPackage,
} from "@/lib/compensation-package";
import ApplyFormClient from "@/app/(dashboard)/jobs/[id]/apply/apply-form-client";
import { submitApplication } from "@/app/(dashboard)/hr/applicants/actions";
import { createClient } from "@/lib/supabase/client";
import { MatchScorePill } from "@/components/ui/match-score-pill";

function formatEmploymentType(employmentType: JobPosting["employment_type"]): string {
  return String(employmentType ?? "")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatWorkSetup(workSetup: JobPosting["work_setup"]): string {
  if (workSetup === "remote" || workSetup === "wfh") return "Remote / WFH";
  if (workSetup === "hybrid") return "Hybrid";
  return "Onsite";
}

function getWorkSetupPillClass(workSetup: JobPosting["work_setup"]): string {
  if (workSetup === "remote" || workSetup === "wfh") {
    return "border-sky-200/80 bg-sky-50/80 text-sky-700";
  }
  if (workSetup === "hybrid") {
    return "border-indigo-200/80 bg-indigo-50/80 text-indigo-700";
  }
  return "border-amber-200/80 bg-amber-50/80 text-amber-700";
}

function resolveCompanyName(job: JobPosting): string {
  if (job.companyName && job.companyName.trim()) {
    return job.companyName.trim();
  }
  const tenantRel = Array.isArray(job.tenant) ? job.tenant[0] : job.tenant;
  if (tenantRel?.name && tenantRel.name.trim()) {
    return tenantRel.name.trim();
  }
  return "Company";
}

interface JobDetailContentProps {
  job: JobPosting;
  hasApplied: boolean;
  matchScore: number | null;
  isCandidate: boolean;
  onClose?: () => void;
}

export default function JobDetailContent({
  job,
  hasApplied: initialHasApplied,
  matchScore,
  isCandidate,
  onClose,
}: JobDetailContentProps) {
  const [view, setView] = useState<"details" | "resume_required" | "apply_form">("details");
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [hasApplied, setHasApplied] = useState(initialHasApplied);

  const searchParams = useSearchParams();
  const urlResumeId = searchParams.get("resume_id") ?? undefined;

  const deptName = (job.departments as unknown as { name: string } | null)?.name ?? "General";

  const handleApplyClick = async () => {
    setIsLoadingResumes(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = "/login";
        return;
      }
      
      const { data } = await supabase
        .from("resumes")
        .select("*")
        .eq("candidate_id", user.id)
        .order("created_at", { ascending: false });
        
      if (data && data.length > 0) {
        setResumes(data as Resume[]);
        setView("apply_form");
      } else {
        setView("resume_required");
      }
    } catch (err) {
      console.error("Error fetching resumes", err);
      // Fallback
      window.location.href = `/applicant/jobs/${job.id}/apply`;
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const handleBackToDetails = () => setView("details");

  const handleApplicationSuccess = () => {
    setHasApplied(true);
  };

  if (view === "resume_required") {
    return (
      <div className="flex flex-col h-full max-h-[85vh] md:max-h-[90vh]">
        <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBackToDetails}
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main"
              aria-label="Back to details"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-text-main truncate">Resume Required</h1>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="rounded-xl border border-border bg-card-bg p-6">
            <p className="w-full text-sm leading-6 text-text-muted mb-6">
              You need to create a resume before applying for jobs. Would you like to create one now?
            </p>
            <div className="flex w-full gap-3 pt-2">
              <button
                onClick={handleBackToDetails}
                className="flex-1 rounded-xl border border-border bg-card-bg px-3 py-2.5 text-sm font-medium text-text-main transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <Link
                href="/applicant/resume/create"
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Create Resume
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === "apply_form") {
    return (
      <div className="flex flex-col h-full max-h-[85vh] md:max-h-[90vh]">
        <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBackToDetails}
              type="button"
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-text-muted hover:text-text-main"
              aria-label="Back to details"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-text-main truncate">Apply for {job.title}</h1>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="rounded-xl border border-border bg-surface-container-low p-4 mb-4">
            <p className="text-sm font-semibold text-text-main">{job.title}</p>
            {deptName !== "General" && (
              <p className="mt-0.5 text-xs text-text-muted">{deptName}</p>
            )}
            {job.location && (
              <p className="mt-0.5 text-xs text-text-muted">{job.location}</p>
            )}
          </div>
          
          <ApplyFormClient
            jobId={job.id}
            resumes={resumes}
            submitAction={submitApplication}
            selectedResumeId={urlResumeId}
            onSuccess={handleApplicationSuccess}
          />
        </div>
      </div>
    );
  }

  const companyName = resolveCompanyName(job);
  const salaryLabel =
    job.salary_min && job.salary_max
      ? `₱${job.salary_min.toLocaleString()} – ₱${job.salary_max.toLocaleString()}`
      : job.salary_min
        ? `From ₱${job.salary_min.toLocaleString()}`
        : job.salary_max
          ? `Up to ₱${job.salary_max.toLocaleString()}`
          : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 max-h-[90dvh] relative bg-white">
      {isLoadingResumes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-xs">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1F195E] border-t-transparent"></div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60 shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              <Building2 className="h-3.5 w-3.5 text-[#1F195E]" />
              {companyName}
            </span>
            {matchScore !== null && (
              <MatchScorePill score={matchScore} />
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
            {job.title}
          </h1>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            type="button"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <Link
            href="/applicant/jobs"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 transition-colors shrink-0"
            aria-label="Back to jobs"
          >
            <X className="h-5 w-5" />
          </Link>
        )}
      </div>

      {/* Metadata Strip */}
      <div className="px-6 py-3.5 border-b border-slate-100 flex flex-wrap gap-2 shrink-0 bg-white">
        {job.location && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            {job.location}
          </span>
        )}
        {salaryLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Wallet className="h-3.5 w-3.5" />
            {salaryLabel}
          </span>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getWorkSetupPillClass(job.work_setup)}`}>
          <Laptop className="h-3.5 w-3.5" />
          {formatWorkSetup(job.work_setup)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D9FC] bg-[#F4F1FF] px-2.5 py-1 text-xs font-semibold text-[#1F195E]">
          <Briefcase className="h-3.5 w-3.5" />
          {formatEmploymentType(job.employment_type)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
          <Calendar className="h-3.5 w-3.5 text-slate-500" />
          Posted {new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-700 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            About the Role
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
            {job.description}
          </p>
        </section>

        {job.requirements && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Requirements
            </h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
              {job.requirements}
            </p>
          </section>
        )}

        {job.required_skills && job.required_skills.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Skills
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {job.required_skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-[#E0D9FC] bg-[#F0ECFF] px-3 py-1 text-xs font-medium text-[#1F195E]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {(() => {
          const settings =
            (
              job as JobPosting & {
                offer_letter_settings?: Record<string, unknown> | null;
              }
            ).offer_letter_settings ?? null;
          if (!settings) return null;
          const pkg = parseCompensationPackage(settings.compensation_package, settings);
          const { selectedBenefitLabels } = computeCompensationTotals(pkg);
          if (selectedBenefitLabels.length === 0) return null;
          return (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Allowances &amp; Benefits
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {selectedBenefitLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </section>
          );
        })()}
      </div>

      {/* Sticky Footer */}
      {isCandidate && (
        <div className="px-6 py-4 pb-6 sm:pb-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          {hasApplied ? (
            <>
              <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Already Applied
              </span>
              <Link
                href="/applicant/applications"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                View Application
              </Link>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Submit your application directly with your selected resume.
              </p>
              <button
                type="button"
                onClick={handleApplyClick}
                className="w-full sm:w-auto rounded-xl bg-[#1F195E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a2376] transition-colors shadow-xs"
              >
                Apply with Selected Resume
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
