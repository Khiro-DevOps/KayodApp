"use client";

import Link from "next/link";
import { useState } from "react";
import { JOB_INDUSTRIES, PHILIPPINE_CITIES } from "@/lib/constants";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/pre-employment-defaults";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";
import PageContainer from "@/components/ui/page-container";
import JobRequiredDocumentsEditor from "@/components/job-required-documents-editor";

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
  workLocations?: any[];
};

function toCsvSkills(value?: string[] | string | null) {
  if (!value) {
    return "";
  }

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
    initialValues?.scheduleType === "rotating" || initialValues?.scheduleType === "flexible" ? "rotating" : "fixed"
  );
  const [restDaysType, setRestDaysType] = useState<string>(
    initialValues?.restDaysType ?? "rotating"
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">{title}</h1>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-danger">{error}</div>}

        <form action={action} className="space-y-6">
          {jobId ? <input type="hidden" name="job_id" value={jobId} /> : null}

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Job Posting Details</h2>

            <div className="space-y-1">
              <label htmlFor="title" className="text-sm font-medium text-text-primary">Job Title *</label>
              <input
                id="title"
                name="title"
                type="text"
                required
                defaultValue={initialValues?.title ?? ""}
                placeholder="e.g. Senior Frontend Developer"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="industry" className="text-sm font-medium text-text-primary">Industry *</label>
                <select
                  id="industry"
                  name="industry"
                  required
                  defaultValue={initialValues?.industry ?? ""}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select Industry</option>
                  {JOB_INDUSTRIES.map((industryOption) => (
                    <option key={industryOption.id} value={industryOption.id}>{industryOption.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="job_category" className="text-sm font-medium text-text-primary">Position Level</label>
                <input
                  id="job_category"
                  name="job_category"
                  type="text"
                  defaultValue={initialValues?.jobCategory ?? ""}
                  placeholder="e.g. Senior, Manager, Lead"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="work_mode" className="text-sm font-medium text-text-primary">Work Mode *</label>
                <div className="flex gap-4">
                  {WORK_MODE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="work_mode"
                        value={option.value}
                        defaultChecked={initialValues?.workMode === option.value || (option.value === "onsite" && !initialValues?.workMode)}
                        className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="work_location_id" className="text-sm font-medium text-text-primary">Office Branch *</label>
                <select
                  id="work_location_id"
                  name="work_location_id"
                  required
                  defaultValue={initialValues?.workLocationId ?? ""}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select Branch</option>
                  {workLocations?.map((branch: any) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="employment_type" className="text-sm font-medium text-text-primary">Employment Type *</label>
                <select
                  id="employment_type"
                  name="employment_type"
                  required
                  defaultValue={initialValues?.employmentType ?? ""}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="" disabled>Select employment type</option>
                  {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="salary_range" className="text-sm font-medium text-text-primary">Salary Range (Monthly)</label>
                <input
                  id="salary_range"
                  name="salary_range"
                  type="text"
                  defaultValue={initialValues?.salaryRange ?? ""}
                  placeholder="e.g. 30000-50000"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-gray-50/50 p-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-text-primary">Schedule Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedule_type_radio"
                      value="fixed"
                      checked={scheduleType === "fixed"}
                      onChange={() => setScheduleType("fixed")}
                      className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">Fixed Schedule</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedule_type_radio"
                      value="rotating"
                      checked={scheduleType === "rotating"}
                      onChange={() => setScheduleType("rotating")}
                      className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">Rotating / Flexible Rest Days</span>
                  </label>
                </div>
                <input type="hidden" name="schedule_type" value={scheduleType} />
              </div>

              {scheduleType === "fixed" ? (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Shift Start & End Time</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          name="shift_start"
                          defaultValue={initialValues?.shiftStart ?? "09:00"}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <span className="text-sm text-gray-500">to</span>
                        <input
                          type="time"
                          name="shift_end"
                          defaultValue={initialValues?.shiftEnd ?? "18:00"}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Work Days</label>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                          <label key={day} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              name="work_days"
                              value={day}
                              defaultChecked={initialValues?.workDays ? initialValues.workDays.includes(day) : (day !== "Sat" && day !== "Sun")}
                              className="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
                            />
                            <span className="text-xs text-gray-700">{day}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <input type="hidden" name="rest_days_type" value="fixed" />
                </div>
              ) : (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Shift Start & End Time</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          name="shift_start"
                          defaultValue={initialValues?.shiftStart ?? "09:00"}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <span className="text-sm text-gray-500">to</span>
                        <input
                          type="time"
                          name="shift_end"
                          defaultValue={initialValues?.shiftEnd ?? "18:00"}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="work_days_count" className="text-xs font-medium text-gray-600">Work Days Count (per week)</label>
                      <input
                        id="work_days_count"
                        name="work_days_count"
                        type="number"
                        min="1"
                        max="7"
                        defaultValue={initialValues?.workDays?.length ? initialValues.workDays.length : 5}
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="rest_days_type" className="text-xs font-medium text-gray-600">Rest Days Policy</label>
                      <select
                        id="rest_days_type"
                        name="rest_days_type"
                        value={restDaysType}
                        onChange={(e) => setRestDaysType(e.target.value)}
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="rotating">Rotating Rest Days</option>
                        <option value="flexible">Flexible / Roster-Based</option>
                        <option value="manager_assigned">Manager Assigned</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="description" className="text-sm font-medium text-text-primary">Job Description *</label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                defaultValue={initialValues?.description ?? ""}
                placeholder="Describe the role, responsibilities, and what the job entails..."
                className="w-full resize-none rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="requirements" className="text-sm font-medium text-text-primary">Requirements & Qualifications</label>
              <textarea
                id="requirements"
                name="requirements"
                rows={3}
                defaultValue={initialValues?.requirements ?? ""}
                placeholder="List qualifications, experience, education, and skills needed..."
                className="w-full resize-none rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="skills" className="text-sm font-medium text-text-primary">Key Skills</label>
              <input
                id="skills"
                name="skills"
                type="text"
                defaultValue={toCsvSkills(initialValues?.skills ?? "")}
                placeholder="React, TypeScript, Node.js (comma-separated)"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <JobRequiredDocumentsEditor name="required_documents_json" initialDocuments={initialDocuments} />
          </div>

          {showOfferLetterSettings ? (
            <div className="border-t-2 border-gray-300 pt-8">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">📄 Philippine Offer Letter Settings</h2>
              <p className="mb-6 text-sm text-gray-600">
                Configure employment terms and conditions in compliance with Philippine Labor Law.
                Job title, description, and location from above will be used in the offer letter.
              </p>

              <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="font-semibold text-gray-900">
                  1. Organization Structure <span className="text-xs font-normal text-red-600">Required</span>
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ph_department" className="text-sm font-medium text-gray-900">Department <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      id="ph_department"
                      name="ph_department"
                      defaultValue={initialValues?.phDepartment ?? ""}
                      placeholder="e.g. Engineering, Sales, HR"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_supervisor_name" className="text-sm font-medium text-gray-900">Direct Supervisor Name <span className="text-red-600">*</span></label>
                    <input
                      type="text"
                      id="ph_supervisor_name"
                      name="ph_supervisor_name"
                      defaultValue={initialValues?.phSupervisorName ?? ""}
                      placeholder="Full name"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_supervisor_title" className="text-sm font-medium text-gray-900">Supervisor Title <span className="text-red-600">*</span></label>
                  <input
                    type="text"
                    id="ph_supervisor_title"
                    name="ph_supervisor_title"
                    defaultValue={initialValues?.phSupervisorTitle ?? ""}
                    placeholder="e.g. Engineering Manager, Team Lead"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="font-semibold text-gray-900">
                  2. Employment Terms (PH Compliance) <span className="text-xs font-normal text-red-600">Required</span>
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ph_employment_status" className="text-sm font-medium text-gray-900">Employment Status <span className="text-red-600">*</span></label>
                    <select
                      id="ph_employment_status"
                      name="ph_employment_status"
                      required
                      defaultValue={initialValues?.phEmploymentStatus ?? ""}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Select Employment Status</option>
                      {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_probation_period_days" className="text-sm font-medium text-gray-900">Probation Period (Days) <span className="text-red-600">*</span></label>
                    <input
                      type="number"
                      id="ph_probation_period_days"
                      name="ph_probation_period_days"
                      min="0"
                      max="180"
                      defaultValue={initialValues?.phProbationPeriodDays ?? "0"}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-gray-500">0 = not applicable; Max 180 days per Art. 281</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_start_date" className="text-sm font-medium text-gray-900">Expected Start Date <span className="text-red-600">*</span></label>
                  <input
                    type="date"
                    id="ph_start_date"
                    name="ph_start_date"
                    required
                    defaultValue={initialValues?.phStartDate ?? ""}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="font-semibold text-gray-900">3. Compensation & Schedule</h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ph_work_schedule" className="text-sm font-medium text-gray-900">Work Schedule</label>
                    <input
                      type="text"
                      id="ph_work_schedule"
                      name="ph_work_schedule"
                      defaultValue={initialValues?.phWorkSchedule ?? ""}
                      placeholder="e.g. Monday to Friday, 9 AM - 6 PM"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_monthly_basic_salary" className="text-sm font-medium text-gray-900">Monthly Basic Salary</label>
                    <input
                      type="number"
                      id="ph_monthly_basic_salary"
                      name="ph_monthly_basic_salary"
                      min="0"
                      step="0.01"
                      defaultValue={initialValues?.phMonthlyBasicSalary ?? ""}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showPublicationStatus ? (
            <div className="space-y-1">
              <label htmlFor="is_published" className="text-sm font-medium text-text-primary">Status</label>
              <select
                id="is_published"
                name="is_published"
                defaultValue={initialValues?.isPublished ? "true" : "false"}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="true">Published</option>
                <option value="false">Draft</option>
              </select>
            </div>
          ) : null}

          <button type="submit" className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark">
            {submitLabel}
          </button>
        </form>
      </div>
    </PageContainer>
  );
}