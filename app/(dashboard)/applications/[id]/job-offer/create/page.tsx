"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createJobOfferProposal,
  sendJobOfferProposal,
} from "@/app/api/job-offers/actions";
import { DollarSign, Calendar, Briefcase, AlertCircle, Loader } from "lucide-react";

interface Application {
  id: string;
  candidate_id: string;
  job_posting_id: string;
  status: string;
}

interface JobPosting {
  id: string;
  title: string;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export default function CreateJobOfferPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;
  const supabase = createClient();

  const [application, setApplication] = useState<Application | null>(null);
  const [candidate, setCandidate] = useState<Profile | null>(null);
  const [jobPosting, setJobPosting] = useState<JobPosting | null>(null);

  const [formData, setFormData] = useState({
    baseSalary: "",
    startDate: new Date().toISOString().split("T")[0],
    positionTitle: "",
    benefitsSummary: "",
    otherTerms: {} as Record<string, unknown>,
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saveMode, setSaveMode] = useState<"draft" | "send">("draft");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadApplicationDetails();
  }, [applicationId]);

  const loadApplicationDetails = async () => {
    try {
      // Get application
      const { data: app } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .single();

      if (!app) throw new Error("Application not found");
      setApplication(app);

      // Get candidate
      const { data: cand } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", app.candidate_id)
        .single();
      setCandidate(cand);

      // Get job posting
      const { data: job } = await supabase
        .from("job_postings")
        .select("*")
        .eq("id", app.job_posting_id)
        .single();
      setJobPosting(job);

      // Pre-fill position title
      if (job) {
        setFormData((prev) => ({
          ...prev,
          positionTitle: job.title,
        }));
      }
    } catch (err) {
      console.error("Error loading application:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load application"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent, mode: "draft" | "send") => {
    e.preventDefault();
    setSaveMode(mode);

    if (!application) return;

    if (
      !formData.baseSalary ||
      !formData.startDate ||
      !formData.positionTitle
    ) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Create offer
      const offerResult = await createJobOfferProposal(applicationId, {
        baseSalary: parseFloat(formData.baseSalary),
        startDate: formData.startDate,
        positionTitle: formData.positionTitle,
        benefitsSummary: formData.benefitsSummary || undefined,
        otherTerms: formData.otherTerms,
      });

      if (mode === "send") {
        // Send offer
        await sendJobOfferProposal(offerResult.offer.id);
        setSuccess("Job offer sent to candidate!");
      } else {
        setSuccess("Job offer saved as draft!");
      }

      // Redirect after 2 seconds
      setTimeout(() => router.push(`/applications/${applicationId}`), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offer");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading application...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800">Create Job Offer</h1>
          <p className="text-gray-600 mt-2">
            For:{" "}
            <span className="font-semibold">
              {candidate?.first_name} {candidate?.last_name}
            </span>
          </p>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <form onSubmit={(e) => handleSubmit(e, saveMode)}>
            <div className="p-8 space-y-8">
              {/* Candidate Info */}
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="font-semibold text-gray-800 mb-4">
                  Candidate Information
                </h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Name</p>
                    <p className="font-medium text-gray-800">
                      {candidate?.first_name} {candidate?.last_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Email</p>
                    <p className="font-medium text-gray-800">{candidate?.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Position</p>
                    <p className="font-medium text-gray-800">
                      {jobPosting?.title}
                    </p>
                  </div>
                </div>
              </div>

              {/* Position Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position Title *
                </label>
                <input
                  type="text"
                  name="positionTitle"
                  value={formData.positionTitle}
                  onChange={handleInputChange}
                  placeholder="e.g., Senior Software Engineer"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  disabled={submitting}
                />
              </div>

              {/* Base Salary */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Base Salary (Monthly) * (PHP)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-500">₱</span>
                    <input
                      type="number"
                      name="baseSalary"
                      value={formData.baseSalary}
                      onChange={handleInputChange}
                      placeholder="0"
                      className="w-full pl-8 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Benefits Summary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Benefits Summary
                </label>
                <textarea
                  name="benefitsSummary"
                  value={formData.benefitsSummary}
                  onChange={handleInputChange}
                  placeholder="e.g., Health insurance, 15 days vacation, performance bonus..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                  disabled={submitting}
                />
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-4">Preview</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between">
                    <span>Position:</span>
                    <span className="font-medium">
                      {formData.positionTitle || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Salary:</span>
                    <span className="font-medium">
                      {formData.baseSalary
                        ? `₱${parseFloat(formData.baseSalary).toLocaleString()}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Start Date:</span>
                    <span className="font-medium">
                      {formData.startDate
                        ? new Date(formData.startDate).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-gray-50 px-8 py-6 border-t flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmit(
                    e as unknown as React.FormEvent,
                    "draft"
                  );
                }}
                disabled={submitting}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {submitting ? "Saving..." : "Save as Draft"}
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  e.preventDefault();
                  handleSubmit(
                    e as unknown as React.FormEvent,
                    "send"
                  );
                }}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {submitting ? "Sending..." : "Create & Send Offer"}
              </button>
            </div>
          </form>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ Tip:</strong> You can save the offer as a draft first to
            review, then send it to the candidate later. Once sent, the candidate
            will receive a notification and can review, accept, or request
            renegotiation.
          </p>
        </div>
      </div>
    </div>
  );
}
