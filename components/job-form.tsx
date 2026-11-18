"use client";

import Link from "next/link";
import { useState } from "react";
import { JOB_INDUSTRIES } from "@/lib/constants";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";
import PageContainer from "@/components/ui/page-container";
import JobRequiredDocumentsEditor from "@/components/job-required-documents-editor";
import PhilippineCompensationChecklist from "@/components/jobs/PhilippineCompensationChecklist";
import {
  createDefaultCompensationPackage,
  type PhilippineCompensationPackage,
} from "@/lib/compensation-package";

const WORK_MODE_OPTIONS = [
  { value: "onsite", label: "On-Site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "intern", label: "Internship" },
];

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "probationary", label: "Probationary" },
  { value: "project_based", label: "Project-based" },
  { value: "seasonal", label: "Seasonal" },
  { value: "casual", label: "Casual" },
];

export type JobFormValues = {
  title?: string;
  industry?: string | null;
  jobCategory?: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  workLocationId?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: string[] | null;
  salaryRange?: string | null;
  description?: string | null;
  requirements?: string | null;
  skills?: string[] | string | null;
  isPublished?: boolean;
  phDepartment?: string | null;
  phSupervisorName?: string | null;
  phSupervisorTitle?: string | null;
  phEmploymentStatus?: string | null;
  phProbationPeriodDays?: number | string | null;
  phStartDate?: string | null;
  phWorkSchedule?: string | null;
  phMonthlyBasicSalary?: number | string | null;
  phPayFrequency?: string | null;
  phSigningBonus?: number | string | null;
  phTransportAllowance?: number | string | null;
  phInternetAllowance?: number | string | null;
  phMealAllowance?: number | string | null;
  phNightDifferential?: number | string | null;
  phServiceIncentiveLeave?: number | string | null;
  phVacationLeaveDays?: number | string | null;
  phSickLeaveDays?: number | string | null;
  phHmoProvider?: string | null;
  scheduleType?: "fixed" | "flexible" | "rotating" | null;
  restDaysType?: "fixed" | "rotating" | "flexible" | null;
  compensationPackage?: PhilippineCompensationPackage;
};

type JobFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  submitLabel: string;
  backHref: string;
  error?: string | null;
  jobId?: string;
  initialValues?: JobFormValues;
  initialDocuments?: RequiredDocumentDraft[];
  showOfferLetterSettings?: boolean;
  showPublicationStatus?: boolean;
  workLocations?: Array<{ id: string; name: string }>;
};

function toCsvSkills(value?: string[] | string | null) {
  if (!value) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

export default function JobForm({
  action,
  title,
  submitLabel,
  backHref,
  error,
  jobId,
  initialValues,
  initialDocuments = DEFAULT_REQUIRED_DOCUMENTS,
  showOfferLetterSettings = false,
  showPublicationStatus = false,
  workLocations = [],
}: JobFormProps) {
  const [scheduleType, setScheduleType] = useState<"fixed" | "rotating">(
    initialValues?.scheduleType === "rotating" || initialValues?.scheduleType === "flexible"
      ? "rotating"
      : "fixed"
  );
  const [restDaysType, setRestDaysType] = useState<string>(
    initialValues?.restDaysType ?? "rotating"
  );
  const [baseSalaryInput, setBaseSalaryInput] = useState<string>(
    initialValues?.phMonthlyBasicSalary != null ? String(initialValues.phMonthlyBasicSalary) : ""
  );
  const [compensationPackage, setCompensationPackage] = useState<PhilippineCompensationPackage>(
    () => initialValues?.compensationPackage ?? createDefaultCompensationPackage()
  );

  return (
    <PageContainer>
      <div className="w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <div>
              <h1 className="font-(family-name:--font-heading) text-2xl font-bold text-slate-900">
                {title}
              </h1>
              <p className="text-xs text-slate-500">
                Configure role details, shift &amp; break policy, Philippine compensation, and contract terms.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <form action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {jobId ? <input type="hidden" name="job_id" value={jobId} /> : null}

          {/* Left 8 Columns: Role Basics, Work Setup & Branch, Shift & Break Policy, Description, Documents */}
          <div className="lg:col-span-8 space-y-6">
            {/* Role Basics */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Role Basics</h2>
                <p className="text-xs text-slate-500">Core job details visible to applicants and used in offers.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="title" className="text-xs font-semibold text-slate-700">
                  Job Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  defaultValue={initialValues?.title ?? ""}
                  placeholder="e.g. Senior Frontend Developer"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="industry" className="text-xs font-semibold text-slate-700">
                    Industry <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="industry"
                    name="industry"
                    required
                    defaultValue={initialValues?.industry ?? ""}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Industry</option>
                    {JOB_INDUSTRIES.map((industryOption) => (
                      <option key={industryOption.id} value={industryOption.id}>
                        {industryOption.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="job_category" className="text-xs font-semibold text-slate-700">
                    Position Level
                  </label>
                  <input
                    id="job_category"
                    name="job_category"
                    type="text"
                    defaultValue={initialValues?.jobCategory ?? ""}
                    placeholder="e.g. Senior, Manager, Lead"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="employment_type" className="text-xs font-semibold text-slate-700">
                    Employment Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="employment_type"
                    name="employment_type"
                    required
                    defaultValue={initialValues?.employmentType ?? "full_time"}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="" disabled>
                      Select employment type
                    </option>
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="salary_range" className="text-xs font-semibold text-slate-700">
                    Salary Range (Monthly)
                  </label>
                  <input
                    id="salary_range"
                    name="salary_range"
                    type="text"
                    defaultValue={initialValues?.salaryRange ?? ""}
                    placeholder="e.g. 30000-50000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_monthly_basic_salary" className="text-xs font-semibold text-slate-700">
                    Monthly Basic Salary (₱)
                  </label>
                  <input
                    type="number"
                    id="ph_monthly_basic_salary"
                    name="ph_monthly_basic_salary"
                    min="0"
                    step="0.01"
                    value={baseSalaryInput}
                    onChange={(e) => setBaseSalaryInput(e.target.value)}
                    placeholder="e.g. 35000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
            </section>

            {/* Work Setup & Branch */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Work Setup &amp; Branch</h2>
                <p className="text-xs text-slate-500">Define onsite/hybrid/remote arrangement and assigned office branch.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Work Mode <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {WORK_MODE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 cursor-pointer hover:bg-slate-100"
                      >
                        <input
                          type="radio"
                          name="work_mode"
                          value={option.value}
                          defaultChecked={
                            initialValues?.workMode === option.value ||
                            (option.value === "onsite" && !initialValues?.workMode)
                          }
                          className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-semibold text-slate-800">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="work_location_id" className="text-xs font-semibold text-slate-700">
                    Office Branch <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="work_location_id"
                    name="work_location_id"
                    required
                    defaultValue={initialValues?.workLocationId ?? ""}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Branch</option>
                    {workLocations?.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Shift & Break Policy */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Shift &amp; Break Policy</h2>
                  <p className="text-xs text-slate-500">
                    Standard 08:00 AM – 05:00 PM (8 hrs paid + 1 hr unpaid lunch, 2 × 15-min paid breaks).
                  </p>
                </div>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700">
                  8 hrs paid · 1 hr unpaid lunch · 2 × 15-min paid breaks
                </span>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule_type_radio"
                    value="fixed"
                    checked={scheduleType === "fixed"}
                    onChange={() => setScheduleType("fixed")}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">Fixed Schedule</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule_type_radio"
                    value="rotating"
                    checked={scheduleType === "rotating"}
                    onChange={() => setScheduleType("rotating")}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">Rotating / Flexible Rest Days</span>
                </label>
                <input type="hidden" name="schedule_type" value={scheduleType} />
              </div>

              {scheduleType === "fixed" ? (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Shift Start &amp; End Time
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          name="shift_start"
                          defaultValue={initialValues?.shiftStart ?? "08:00"}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <span className="text-xs font-medium text-slate-500">to</span>
                        <input
                          type="time"
                          name="shift_end"
                          defaultValue={initialValues?.shiftEnd ?? "17:00"}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Work Days</label>
                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                          <label key={day} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 cursor-pointer">
                            <input
                              type="checkbox"
                              name="work_days"
                              value={day}
                              defaultChecked={
                                initialValues?.workDays
                                  ? initialValues.workDays.includes(day)
                                  : day !== "Sat" && day !== "Sun"
                              }
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs font-medium text-slate-800">{day}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <input type="hidden" name="rest_days_type" value="fixed" />
                </div>
              ) : (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Shift Start &amp; End Time</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          name="shift_start"
                          defaultValue={initialValues?.shiftStart ?? "08:00"}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        <span className="text-xs text-slate-500">to</span>
                        <input
                          type="time"
                          name="shift_end"
                          defaultValue={initialValues?.shiftEnd ?? "17:00"}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="work_days_count" className="text-xs font-semibold text-slate-700">
                        Work Days / Week
                      </label>
                      <input
                        id="work_days_count"
                        name="work_days_count"
                        type="number"
                        min="1"
                        max="7"
                        defaultValue={initialValues?.workDays?.length ? initialValues.workDays.length : 5}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="rest_days_type" className="text-xs font-semibold text-slate-700">
                        Rest Days Policy
                      </label>
                      <select
                        id="rest_days_type"
                        name="rest_days_type"
                        value={restDaysType}
                        onChange={(e) => setRestDaysType(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="rotating">Rotating Rest Days</option>
                        <option value="flexible">Flexible / Roster-Based</option>
                        <option value="manager_assigned">Manager Assigned</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Description, Requirements & Skills */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Description, Requirements &amp; Skills</h2>
              </div>

              <div className="space-y-1">
                <label htmlFor="description" className="text-xs font-semibold text-slate-700">
                  Job Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  required
                  rows={4}
                  defaultValue={initialValues?.description ?? ""}
                  placeholder="Describe the role, responsibilities, and what the job entails..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="requirements" className="text-xs font-semibold text-slate-700">
                  Requirements &amp; Qualifications
                </label>
                <textarea
                  id="requirements"
                  name="requirements"
                  rows={3}
                  defaultValue={initialValues?.requirements ?? ""}
                  placeholder="List qualifications, experience, education, and skills needed..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="skills" className="text-xs font-semibold text-slate-700">
                  Key Skills
                </label>
                <input
                  id="skills"
                  name="skills"
                  type="text"
                  defaultValue={toCsvSkills(initialValues?.skills ?? "")}
                  placeholder="React, TypeScript, Node.js (comma-separated)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </section>

            {/* Required Pre-Employment Documents */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <JobRequiredDocumentsEditor
                name="required_documents_json"
                initialDocuments={initialDocuments}
              />
            </section>
          </div>

          {/* Right 4 Columns: Philippine Compensation Checklist, Offer Letter Terms, Publish CTA */}
          <div className="lg:col-span-4 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Philippine Allowances &amp; Incentives
                </h2>
                <p className="text-xs text-slate-500">
                  Carried automatically into Offer Drafts, DocuSeal contracts, and Payroll.
                </p>
              </div>
              <PhilippineCompensationChecklist
                value={compensationPackage}
                onChange={setCompensationPackage}
                hiddenInputName="compensation_package_json"
                baseSalary={Number(baseSalaryInput) || 0}
              />
            </section>

            {showOfferLetterSettings && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Offer Letter Terms</h2>
                  <p className="text-xs text-slate-500">PH Labor Law defaults for generated contracts.</p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_department" className="text-xs font-semibold text-slate-700">
                    Department
                  </label>
                  <input
                    type="text"
                    id="ph_department"
                    name="ph_department"
                    defaultValue={initialValues?.phDepartment ?? ""}
                    placeholder="e.g. Engineering, Sales, HR"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="ph_supervisor_name" className="text-xs font-semibold text-slate-700">
                      Supervisor
                    </label>
                    <input
                      type="text"
                      id="ph_supervisor_name"
                      name="ph_supervisor_name"
                      defaultValue={initialValues?.phSupervisorName ?? ""}
                      placeholder="Full name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ph_supervisor_title" className="text-xs font-semibold text-slate-700">
                      Supervisor Title
                    </label>
                    <input
                      type="text"
                      id="ph_supervisor_title"
                      name="ph_supervisor_title"
                      defaultValue={initialValues?.phSupervisorTitle ?? ""}
                      placeholder="Team Lead"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="ph_employment_status" className="text-xs font-semibold text-slate-700">
                      Employment Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="ph_employment_status"
                      name="ph_employment_status"
                      required={!jobId}
                      defaultValue={initialValues?.phEmploymentStatus ?? "probationary"}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900"
                    >
                      {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ph_probation_period_days" className="text-xs font-semibold text-slate-700">
                      Probation Days
                    </label>
                    <input
                      type="number"
                      id="ph_probation_period_days"
                      name="ph_probation_period_days"
                      min="0"
                      max="180"
                      defaultValue={initialValues?.phProbationPeriodDays ?? "180"}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_start_date" className="text-xs font-semibold text-slate-700">
                    Expected Start Date {!jobId && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="date"
                    id="ph_start_date"
                    name="ph_start_date"
                    required={!jobId}
                    defaultValue={initialValues?.phStartDate ?? ""}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </section>
            )}

            {showPublicationStatus && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
                <label htmlFor="is_published" className="text-xs font-semibold text-slate-700">
                  Publication Status
                </label>
                <select
                  id="is_published"
                  name="is_published"
                  defaultValue={initialValues?.isPublished ? "true" : "false"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                >
                  <option value="true">Published</option>
                  <option value="false">Draft</option>
                </select>
              </section>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-[#1e1b4b] py-3.5 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#2d2b68]"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
