/**
 * EXAMPLE INTEGRATION: Philippine-Compliant Offer Letter in Job Form
 * 
 * This file demonstrates how to integrate the OfferLetterPhAccordion component
 * into an existing job creation form with full validation and submission handling.
 */

"use client";

import React, { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createJob } from "../../actions";
import OfferLetterPhAccordion from "@/components/offer-letter-ph/offer-letter-ph-accordion";
import type { OfferLetterPhType } from "@/lib/schemas/offer-letter-ph";
import { flattenOfferLetterPhToFormData } from "@/lib/offer-letter-ph-utils";

export default function JobFormWithOfferLetterExample() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const formRef = useRef<HTMLFormElement>(null);

  // Track expanded state of basic job details
  const [expandOfferSettings, setExpandOfferSettings] = useState(false);

  // Track offer letter form state
  const [offerLetterValues, setOfferLetterValues] = useState<
    Partial<OfferLetterPhType>
  >({});

  /**
   * Handle form submission
   * Collects both basic job info and offer letter settings
   */
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Get form data
    const formData = new FormData(formRef.current!);

    // Add flattened offer letter data
    const flatOfferLetter = flattenOfferLetterPhToFormData(offerLetterValues);
    Object.entries(flatOfferLetter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    // Submit
    await createJob(formData);
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleFormSubmit}
      className="space-y-6 max-w-4xl"
    >
      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* SECTION 1: BASIC JOB DETAILS */}
      <div className="space-y-4 rounded-lg border border-[#333] bg-[#1a1a1a] p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Basic Job Information
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="block text-sm font-medium text-text-primary"
            >
              Job Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              placeholder="e.g., Senior Software Engineer"
              className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="industry"
              className="block text-sm font-medium text-text-primary"
            >
              Industry <span className="text-red-400">*</span>
            </label>
            <select
              id="industry"
              name="industry"
              required
              className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select Industry</option>
              <option value="technology">Technology</option>
              <option value="finance">Finance</option>
              <option value="healthcare">Healthcare</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="description"
            className="block text-sm font-medium text-text-primary"
          >
            Job Description
          </label>
          <textarea
            id="description"
            name="description"
            placeholder="Brief overview of the position..."
            rows={3}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* SECTION 2: PHILIPPINE OFFER LETTER SETTINGS */}
      <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-6">
        <OfferLetterPhAccordion
          initialValues={offerLetterValues}
          onValuesChange={setOfferLetterValues}
          formRef={formRef}
        />
      </div>

      {/* SECTION 3: SUBMISSION */}
      <div className="flex gap-3">
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Create Job & Offer Template
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-md border border-[#333] px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-[#222] transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* COMPLIANCE NOTICE */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-xs text-blue-300">
        <p className="font-semibold mb-2">Philippine Labor Law Compliance</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Probation period capped at 180 days (Art. 281)</li>
          <li>13th month pay is mandatory (P.D. 851)</li>
          <li>SSS, PhilHealth, Pag-IBIG enrollment required (RA 7875)</li>
          <li>Night differential minimum 10% (RA 11165)</li>
          <li>
            Termination only for just or authorized cause (Labor Code Art. 282-283)
          </li>
        </ul>
      </div>
    </form>
  );
}

/**
 * EXAMPLE: Handling Form Submission in Server Action
 * 
 * In app/(dashboard)/jobs/actions.ts:
 */

/*
import { validateOfferLetterPhFormData, formatOfferLetterPhForDocuSeal } from "@/lib/offer-letter-ph-utils";

export async function createJob(formData: FormData) {
  // ... existing auth checks ...

  // Extract basic job fields
  const title = formData.get("title") as string;
  const industry = formData.get("industry") as string;
  
  // Extract ALL form data for offer letter validation
  const offerLetterFormData: Record<string, any> = {};
  for (const [key, value] of formData.entries()) {
    if (key.includes(".")) {
      offerLetterFormData[key] = value;
    }
  }

  // Validate offer letter data
  const validation = validateOfferLetterPhFormData(offerLetterFormData);
  
  if (!validation.success) {
    const errorMessage = Object.values(validation.errors || {})
      .flat()
      .join("; ");
    return redirect(
      `/jobs/manage/new?error=${encodeURIComponent(`Offer letter validation failed: ${errorMessage}`)}`
    );
  }

  // Format for DocuSeal and database storage
  const offerLetterSettings = formatOfferLetterPhForDocuSeal(validation.data);

  // Create job with offer letter settings
  const { data: jobData, error } = await adminClient
    .from("job_postings")
    .insert({
      created_by: user.id,
      title,
      industry,
      offer_letter_settings: offerLetterSettings,
      // ... other fields ...
    })
    .select("id")
    .single();

  if (error) {
    return redirect(`/jobs/manage/new?error=${encodeURIComponent(error.message)}`);
  }

  // ... create DocuSeal template with offerLetterSettings ...
  
  revalidatePath("/jobs");
  redirect("/jobs/manage");
}
*/
