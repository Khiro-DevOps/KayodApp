"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageContainer from "@/components/ui/page-container";
import { createJob } from "../../actions";
import { PHILIPPINE_CITIES, JOB_INDUSTRIES } from "@/lib/constants";

const WORK_SETUP_OPTIONS = [
  { value: "onsite", label: "On-Site" },
  { value: "remote", label: "Remote" },
  { value: "wfh", label: "WFH" },
  { value: "hybrid", label: "Hybrid" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full Time" },
  { value: "part-time", label: "Part Time" },
  { value: "internship", label: "Internship" },
];

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "probationary", label: "Probationary" },
  { value: "project_based", label: "Project-based" },
  { value: "seasonal", label: "Seasonal" },
  { value: "casual", label: "Casual" },
];

export default function NewJobForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/jobs/manage"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Post New Job
          </h1>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={createJob} className="space-y-6">
          {/* ============================================================ */}
          {/* SECTION 1: JOB POSTING DETAILS */}
          {/* ============================================================ */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Job Posting Details
            </h2>

            {/* Job Title */}
            <div className="space-y-1">
              <label htmlFor="title" className="text-sm font-medium text-text-primary">
                Job Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Senior Frontend Developer"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Industry & Job Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="industry" className="text-sm font-medium text-text-primary">
                  Industry *
                </label>
                <select
                  id="industry"
                  name="industry"
                  required
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="">Select Industry</option>
                  {JOB_INDUSTRIES.map((industry) => (
                    <option key={industry.id} value={industry.id}>
                      {industry.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="job_category" className="text-sm font-medium text-text-primary">
                  Position Level
                </label>
                <input
                  id="job_category"
                  name="job_category"
                  type="text"
                  placeholder="e.g. Senior, Manager, Lead"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Work Setup & Employment Type */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="work_setup" className="text-sm font-medium text-text-primary">
                    Work Setup *
                  </label>
                  <div className="group relative flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-tertiary hover:text-text-secondary cursor-help">
                      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
                    </svg>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-72 rounded-lg bg-gray-900 p-3 text-xs text-white shadow-lg group-hover:block z-10">
                      <ul className="space-y-2">
                        <li><strong>Remote:</strong> Work from anywhere</li>
                        <li><strong>WFH:</strong> Home-based, but local to office</li>
                        <li><strong>On-Site:</strong> Full-time office</li>
                        <li><strong>Hybrid:</strong> Mixed schedule</li>
                      </ul>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
                <select
                  id="work_setup"
                  name="work_setup"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="" disabled>
                    Select work setup
                  </option>
                  {WORK_SETUP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="employment_type" className="text-sm font-medium text-text-primary">
                  Employment Type *
                </label>
                <select
                  id="employment_type"
                  name="employment_type"
                  required
                  defaultValue=""
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
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
            </div>

            {/* Location & Salary Range */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="location" className="text-sm font-medium text-text-primary">
                  Work Location *
                </label>
                <select
                  id="location"
                  name="location"
                  required
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="">Select City</option>
                  {PHILIPPINE_CITIES.map((city, index) => (
                    <option key={`${city}-${index}`} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="salary_range" className="text-sm font-medium text-text-primary">
                  Salary Range (Monthly)
                </label>
                <input
                  id="salary_range"
                  name="salary_range"
                  type="text"
                  placeholder="e.g. 30000-50000"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="description" className="text-sm font-medium text-text-primary">
                Job Description *
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                placeholder="Describe the role, responsibilities, and what the job entails..."
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Requirements */}
            <div className="space-y-1">
              <label htmlFor="requirements" className="text-sm font-medium text-text-primary">
                Requirements & Qualifications
              </label>
              <textarea
                id="requirements"
                name="requirements"
                rows={3}
                placeholder="List qualifications, experience, education, and skills needed..."
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <label htmlFor="skills" className="text-sm font-medium text-text-primary">
                Key Skills
              </label>
              <input
                id="skills"
                name="skills"
                type="text"
                placeholder="React, TypeScript, Node.js (comma-separated)"
                className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 2: PHILIPPINE OFFER LETTER SETTINGS */}
          {/* ============================================================ */}
          <div className="border-t-2 border-gray-300 pt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              📄 Philippine Offer Letter Settings
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Configure employment terms and conditions in compliance with Philippine Labor Law.
              Job title, description, and location from above will be used in the offer letter.
            </p>

            {/* SUBSECTION 1: Supervisor & Department */}
            <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">
                1. Organization Structure <span className="text-red-600 text-xs font-normal">Required</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="ph_department" className="text-sm font-medium text-gray-900">
                    Department <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="ph_department"
                    name="ph_department"
                    placeholder="e.g. Engineering, Sales, HR"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_supervisor_name" className="text-sm font-medium text-gray-900">
                    Direct Supervisor Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="ph_supervisor_name"
                    name="ph_supervisor_name"
                    placeholder="Full name"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="ph_supervisor_title" className="text-sm font-medium text-gray-900">
                  Supervisor Title <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="ph_supervisor_title"
                  name="ph_supervisor_title"
                  placeholder="e.g. Engineering Manager, Team Lead"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* SUBSECTION 2: Employment Terms */}
            <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">
                2. Employment Terms (PH Compliance) <span className="text-red-600 text-xs font-normal">Required</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="ph_employment_status" className="text-sm font-medium text-gray-900">
                    Employment Status <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="ph_employment_status"
                    name="ph_employment_status"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select Employment Status</option>
                    {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_probation_period_days" className="text-sm font-medium text-gray-900">
                    Probation Period (Days) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    id="ph_probation_period_days"
                    name="ph_probation_period_days"
                    min="0"
                    max="180"
                    defaultValue="0"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-gray-500">0 = not applicable; Max 180 days per Art. 281</p>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="ph_start_date" className="text-sm font-medium text-gray-900">
                  Expected Start Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  id="ph_start_date"
                  name="ph_start_date"
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="ph_work_schedule" className="text-sm font-medium text-gray-900">
                  Work Schedule <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  id="ph_work_schedule"
                  name="ph_work_schedule"
                  placeholder="e.g. Mon-Fri, 8:00 AM - 5:00 PM"
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* SUBSECTION 3: Compensation */}
            <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">
                3. Compensation (PHP) <span className="text-red-600 text-xs font-normal">Required</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="ph_monthly_basic_salary" className="text-sm font-medium text-gray-900">
                    Monthly Basic Salary (PHP) <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                    <input
                      type="number"
                      id="ph_monthly_basic_salary"
                      name="ph_monthly_basic_salary"
                      min="0"
                      step="0.01"
                      required
                      className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_pay_frequency" className="text-sm font-medium text-gray-900">
                    Pay Frequency <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="ph_pay_frequency"
                    name="ph_pay_frequency"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select Pay Frequency</option>
                    <option value="monthly">Monthly</option>
                    <option value="semi_monthly">Semi-monthly (15th & 30th)</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              {/* 13th Month Pay - Mandatory */}
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                <input
                  type="checkbox"
                  id="ph_mandatory_13th_month"
                  name="ph_mandatory_13th_month"
                  defaultChecked
                  disabled
                  className="mt-1 cursor-pointer rounded border-green-300"
                />
                <label htmlFor="ph_mandatory_13th_month" className="flex flex-1 flex-col gap-1">
                  <span className="font-medium text-gray-900">13th Month Pay (Mandatory)</span>
                  <span className="text-xs text-gray-600">
                    Required by P.D. 851. This entitlement is mandatory and cannot be waived.
                  </span>
                </label>
              </div>

              {/* Optional Allowances */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-900 mb-2">Optional Allowances & Benefits</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ph_signing_bonus" className="text-sm font-medium text-gray-900">
                      Signing Bonus
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                      <input
                        type="number"
                        id="ph_signing_bonus"
                        name="ph_signing_bonus"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_transport_allowance" className="text-sm font-medium text-gray-900">
                      Transport Allowance
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                      <input
                        type="number"
                        id="ph_transport_allowance"
                        name="ph_transport_allowance"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_internet_allowance" className="text-sm font-medium text-gray-900">
                      Internet Allowance (Remote / Hybrid)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                      <input
                        type="number"
                        id="ph_internet_allowance"
                        name="ph_internet_allowance"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <p className="text-xs text-gray-600">Recommended for remote and hybrid roles.</p>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_meal_allowance" className="text-sm font-medium text-gray-900">
                      Meal Allowance (PHP/Day)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
                      <input
                        type="number"
                        id="ph_meal_allowance"
                        name="ph_meal_allowance"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-6 pr-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ph_night_differential" className="text-sm font-medium text-gray-900">
                      Night Differential (%) - RA 11165
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="ph_night_differential"
                        name="ph_night_differential"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue="0"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                    </div>
                    <p className="text-xs text-gray-600">Minimum 10% for night shifts</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SUBSECTION 4: Benefits Package */}
            <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold text-gray-900">
                4. Benefits & Leave Entitlements <span className="text-red-600 text-xs font-normal">Required</span>
              </h3>

              {/* Mandatory Benefits */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-900">Mandatory Benefits (RA 7875)</p>

                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <input
                    type="checkbox"
                    id="ph_sss_enrolled"
                    name="ph_sss_enrolled"
                    defaultChecked
                    disabled
                    className="mt-1 cursor-pointer rounded border-green-300"
                  />
                  <label htmlFor="ph_sss_enrolled" className="flex flex-1 flex-col gap-1">
                    <span className="font-medium text-gray-900">SSS (Social Security System)</span>
                    <span className="text-xs text-gray-600">Mandatory - Employee & employer contributions</span>
                  </label>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <input
                    type="checkbox"
                    id="ph_philhealth_enrolled"
                    name="ph_philhealth_enrolled"
                    defaultChecked
                    disabled
                    className="mt-1 cursor-pointer rounded border-green-300"
                  />
                  <label htmlFor="ph_philhealth_enrolled" className="flex flex-1 flex-col gap-1">
                    <span className="font-medium text-gray-900">PhilHealth</span>
                    <span className="text-xs text-gray-600">Mandatory - Health insurance coverage</span>
                  </label>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <input
                    type="checkbox"
                    id="ph_pagibig_enrolled"
                    name="ph_pagibig_enrolled"
                    defaultChecked
                    disabled
                    className="mt-1 cursor-pointer rounded border-green-300"
                  />
                  <label htmlFor="ph_pagibig_enrolled" className="flex flex-1 flex-col gap-1">
                    <span className="font-medium text-gray-900">Pag-IBIG (HDMF)</span>
                    <span className="text-xs text-gray-600">Mandatory - Housing savings program</span>
                  </label>
                </div>
              </div>

              {/* Leave Entitlements */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="ph_service_incentive_leave" className="text-sm font-medium text-gray-900">
                    Service Incentive Leave (Days/Year) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    id="ph_service_incentive_leave"
                    name="ph_service_incentive_leave"
                    min="5"
                    defaultValue="5"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-gray-500">Minimum 5 days/year (RA 7875)</p>
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_vacation_leave_days" className="text-sm font-medium text-gray-900">
                    Vacation Leave (Days/Year)
                  </label>
                  <input
                    type="number"
                    id="ph_vacation_leave_days"
                    name="ph_vacation_leave_days"
                    min="0"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_sick_leave_days" className="text-sm font-medium text-gray-900">
                    Sick Leave (Days/Year)
                  </label>
                  <input
                    type="number"
                    id="ph_sick_leave_days"
                    name="ph_sick_leave_days"
                    min="0"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="ph_hmo_provider" className="text-sm font-medium text-gray-900">
                    HMO Provider (Optional)
                  </label>
                  <input
                    type="text"
                    id="ph_hmo_provider"
                    name="ph_hmo_provider"
                    placeholder="e.g. Maxicare, Intellicare"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Compliance Notice */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
              <p className="font-semibold mb-2">✓ Philippine Labor Law Compliance</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Art. 281: Probation capped at 180 days</li>
                <li>P.D. 851: 13th month pay is mandatory</li>
                <li>RA 7875: SSS, PhilHealth, Pag-IBIG are mandatory</li>
                <li>RA 11165: Night differential minimum 10% for night shifts</li>
              </ul>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Post Job
          </button>
        </form>
      </div>
    </PageContainer>
  );
}