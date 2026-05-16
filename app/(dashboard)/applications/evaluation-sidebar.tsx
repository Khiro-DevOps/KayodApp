"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Application, JobPosting, EmploymentType, WorkSetup } from "@/lib/types";
import { configureInterviewAvailability, updateApplicationEvaluation } from "./application-detail-actions";
import { sendJobOffer, withdrawJobOffer } from "../jobs/manage/[id]/applicants/actions";
import { createJobOffer } from "@/app/(dashboard)/job-offers/job-offer-actions";
import { toast } from "sonner";

interface EvaluationSidebarProps {
  application: Application;
  job: JobPosting;
  onStatusUpdate: () => void;
  contractTemplates: Array<{
    id: string;
    template_name: string | null;
    docuseal_template_id: string;
  }>;
  activeContractOffer: {
    id: string;
    status: string;
    signing_method: string;
    contract_template_id: string;
    signed_at: string | null;
    contract_templates?: Array<{
      id: string;
      template_name: string | null;
      docuseal_template_id: string;
    }> | null;
  } | null;
}

export default function EvaluationSidebar({
  application,
  job,
  onStatusUpdate,
  contractTemplates,
  activeContractOffer,
}: EvaluationSidebarProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [hrNotes, setHrNotes] = useState(application?.hr_notes || "");
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [supportsOnline, setSupportsOnline] = useState(
    application?.hr_offered_modes?.includes("online") ?? true
  );
  const [supportsInPerson, setSupportsInPerson] = useState(
    application?.hr_offered_modes?.includes("in_person") ?? false
  );
  const [officeAddress, setOfficeAddress] = useState(application?.hr_office_address || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    activeContractOffer?.contract_template_id || contractTemplates[0]?.id || ""
  );
  const [signingMethod, setSigningMethod] = useState<string>(
    activeContractOffer?.signing_method || "digital"
  );
  const [offerNotes, setOfferNotes] = useState("");
  const [offerError, setOfferError] = useState<string | null>(null);
  const [isSendingOffer, setIsSendingOffer] = useState(false);
  const [isWithdrawingOffer, setIsWithdrawingOffer] = useState(false);

  // New Offer Form State
  const [showNewOfferForm, setShowNewOfferForm] = useState(false);
  const [newOfferError, setNewOfferError] = useState<string | null>(null);
  const [isCreatingOffer, setIsCreatingOffer] = useState(false);
  const [salary, setSalary] = useState<number | "">(job?.salary_min || "");
  const [currency, setCurrency] = useState(job?.currency || "PHP");
  const [employmentType, setEmploymentType] = useState<EmploymentType>((job?.employment_type as EmploymentType) || "full-time");
  const [startDate, setStartDate] = useState("");
  const [workArrangement, setWorkArrangement] = useState<WorkSetup>("hybrid");
  const [expiryDays, setExpiryDays] = useState(7);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState("");

  const statusConfig: Record<
    string,
    {
      label: string;
      color: string;
      bgColor: string;
      nextActions: Array<{ label: string; status: string; color: string }>;
    }
  > = {
    submitted: {
      label: "Submitted",
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      nextActions: [
        { label: "Shortlist", status: "shortlisted", color: "bg-yellow-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    under_review: {
      label: "Under Review",
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      nextActions: [
        { label: "Mark as Interviewed", status: "interviewed", color: "bg-purple-500" },
        { label: "Shortlist", status: "shortlisted", color: "bg-yellow-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    shortlisted: {
      label: "Shortlisted",
      color: "text-yellow-700",
      bgColor: "bg-yellow-50",
      nextActions: [
        { label: "Schedule Interview", status: "interview_scheduled", color: "bg-purple-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    interview_scheduled: {
      label: "Interview Scheduled",
      color: "text-purple-700",
      bgColor: "bg-purple-50",
      nextActions: [
        { label: "Mark as Interviewed", status: "interviewed", color: "bg-purple-600" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    interviewed: {
      label: "Interviewed",
      color: "text-purple-700",
      bgColor: "bg-purple-50",
      nextActions: [
        { label: "Move to Review", status: "under_review", color: "bg-blue-500" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    offer_sent: {
      label: "Offer Sent",
      color: "text-green-700",
      bgColor: "bg-green-50",
      nextActions: [
        { label: "Mark as Hired", status: "hired", color: "bg-green-600" },
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    negotiating: {
      label: "Negotiating",
      color: "text-purple-700",
      bgColor: "bg-purple-50",
      nextActions: [
        { label: "Reject", status: "rejected", color: "bg-red-500" },
      ],
    },
    hired: {
      label: "Hired",
      color: "text-green-700",
      bgColor: "bg-green-50",
      nextActions: [],
    },
    rejected: {
      label: "Rejected",
      color: "text-red-700",
      bgColor: "bg-red-50",
      nextActions: [],
    },
  };

  const config = statusConfig[application?.status] || statusConfig.submitted;
  const nextActions = config.nextActions;
  const matchScore = application?.match_score ?? null;

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application?.id);
      formData.append("status", newStatus);
      formData.append("hr_notes", hrNotes);

      await updateApplicationEvaluation(formData);
      onStatusUpdate();
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvailabilitySave = async () => {
    setAvailabilityError(null);

    if (!supportsOnline && !supportsInPerson) {
      setAvailabilityError("Select at least one interview mode.");
      return;
    }

    if (supportsInPerson && !officeAddress.trim()) {
      setAvailabilityError("Office address is required when in-person interviews are enabled.");
      return;
    }

    setIsSavingAvailability(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application.id);
      if (supportsOnline) {
        formData.append("hr_offered_modes", "online");
      }
      if (supportsInPerson) {
        formData.append("hr_offered_modes", "in_person");
      }
      formData.append("hr_office_address", officeAddress.trim());

      await configureInterviewAvailability(formData);
      onStatusUpdate();
    } catch (error) {
      setAvailabilityError(
        error instanceof Error ? error.message : "Failed to save interview availability"
      );
    } finally {
      setIsSavingAvailability(false);
    }
  };

  const handleSendOffer = async () => {
    setOfferError(null);

    if (!selectedTemplateId) {
      setOfferError("Choose a contract template before sending an offer.");
      return;
    }

    setIsSendingOffer(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application.id);
      formData.append("contract_template_id", selectedTemplateId);
      formData.append("signing_method", signingMethod);
      if (offerNotes.trim()) {
        formData.append("notes", offerNotes.trim());
      }

      const result = await sendJobOffer(formData);
      if (!result?.success) {
        setOfferError(result?.error || "Failed to send job offer");
        toast.error(result?.error || "Failed to send job offer");
        return;
      }

      setOfferNotes("");
      toast.success("Success: Offer has been sent to the applicant.");
      onStatusUpdate();
    } finally {
      setIsSendingOffer(false);
    }
  };

  const handleWithdrawOffer = async () => {
    setOfferError(null);
    setIsWithdrawingOffer(true);
    try {
      const formData = new FormData();
      formData.append("application_id", application.id);

      const result = await withdrawJobOffer(formData);
      if (!result?.success) {
        setOfferError(result?.error || "Failed to withdraw job offer");
        return;
      }

      onStatusUpdate();
    } finally {
      setIsWithdrawingOffer(false);
    }
  };

  const handleCreateNewOffer = async () => {
    setNewOfferError(null);

    if (!salary) {
      setNewOfferError("Salary is required");
      return;
    }

    if (!startDate) {
      setNewOfferError("Start date is required");
      return;
    }

    if (expiryDays < 1 || expiryDays > 90) {
      setNewOfferError("Expiry days must be between 1 and 90");
      return;
    }

    setIsCreatingOffer(true);
    try {
      const terms = {
        salary: Number(salary),
        currency,
        employmentType,
        startDate,
        workArrangement,
        department: (job as any)?.department || "General",
        manager: "", // Optional - can be set later
        benefits,
        notes: "",
      };

      const result = await createJobOffer(application.id, terms, expiryDays);

      if (!result.success) {
        setNewOfferError(result.error || "Failed to create job offer");
        return;
      }

      toast.success("Job offer created successfully!");
      router.push(`/job-offer/${result.offerId}`);
    } catch (error) {
      setNewOfferError(error instanceof Error ? error.message : "Failed to create job offer");
    } finally {
      setIsCreatingOffer(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Status */}
      <div className={`rounded-2xl border border-border ${config.bgColor} p-6`}>
        <p className="text-xs font-medium uppercase text-text-secondary mb-2">Current Status</p>
        <p className={`text-lg font-bold ${config.color} capitalize`}>{config.label}</p>
        {matchScore !== null && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-text-primary">
            <span
              className={`h-2 w-2 rounded-full ${
                matchScore >= 70 ? "bg-green-500" : matchScore >= 40 ? "bg-yellow-500" : "bg-red-500"
              }`}
            />
            Resume match {matchScore}%
          </div>
        )}
        <p className="text-xs text-text-secondary mt-3">
          Last updated {new Date(application?.updated_at).toLocaleDateString()}
        </p>
      </div>

      {/* Match Score & Job Info */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-2">Match Score</p>
          <div className="flex items-center gap-3">
            {matchScore !== null ? (
              <>
                <div className="text-2xl font-bold text-text-primary">{matchScore}%</div>
                <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      matchScore >= 70
                        ? "bg-green-500"
                        : matchScore >= 40
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${matchScore}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-text-secondary">Match score not available</p>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium uppercase text-text-secondary mb-2">Job Information</p>
          <div className="space-y-2 text-sm">
            <p className="text-text-primary font-medium">{job?.title}</p>
            {job?.location && (
              <p className="text-text-secondary">📍 {job.location}</p>
            )}
            {job?.salary_min && job?.salary_max && (
              <p className="text-text-secondary">
                💰 {job.salary_min.toLocaleString()} - {job.salary_max.toLocaleString()} {job.currency}
              </p>
            )}
            <p className="text-text-secondary capitalize">
              📋 {job?.employment_type?.replace("_", " ")}
            </p>
          </div>
        </div>
      </div>

      {/* HR Notes */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <label className="text-xs font-medium uppercase text-text-secondary block mb-2">
          HR Notes
        </label>
        <textarea
          value={hrNotes}
          onChange={(e) => setHrNotes(e.target.value)}
          placeholder="Add internal notes about this candidate..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          rows={4}
        />
        <button
          onClick={async () => {
            setIsLoading(true);
            try {
              const formData = new FormData();
              formData.append("application_id", application?.id);
              formData.append("hr_notes", hrNotes);
              await updateApplicationEvaluation(formData);
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
          className="mt-3 w-full px-4 py-2 text-sm font-medium bg-gray-100 text-text-secondary rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Save Notes
        </button>
      </div>

      {/* Interview Preferences */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-1">
            Interview Preferences
          </p>
          <p className="text-xs text-text-secondary">
            Configure available interview formats for this candidate. They will make the final selection.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSupportsOnline((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              supportsOnline
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-white text-text-secondary"
            }`}
          >
            Online
          </button>
          <button
            type="button"
            onClick={() => setSupportsInPerson((prev) => !prev)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              supportsInPerson
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-white text-text-secondary"
            }`}
          >
            In-Person
          </button>
        </div>

        {supportsInPerson && (
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Office Address</label>
            <input
              type="text"
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder="e.g. 5F Kayod HQ, Cebu IT Park"
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              This will be used as the default interview location.
            </p>
          </div>
        )}

        {application.selected_mode && (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Candidate selected: {application.selected_mode === "online" ? "Online" : "In-Person"}
          </p>
        )}

        {availabilityError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{availabilityError}</p>
        )}

        <button
          type="button"
          onClick={handleAvailabilitySave}
          disabled={isSavingAvailability}
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSavingAvailability ? "Saving..." : "Save Interview Preferences"}
        </button>
      </div>

      {/* Job Offer */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-1">Job Offer</p>
          <p className="text-xs text-text-secondary">
            Prepare and send the contract-backed offer for this applicant.
          </p>
        </div>

        {activeContractOffer ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">Active offer</p>
            <p className="text-xs text-green-700">
              Status: {activeContractOffer.status}
            </p>
            <p className="text-xs text-green-700">
              Template: {activeContractOffer.contract_templates?.[0]?.template_name || "Unnamed template"}
            </p>
            {activeContractOffer.status === "sent" && (
              <button
                type="button"
                onClick={handleWithdrawOffer}
                disabled={isWithdrawingOffer}
                className="w-full rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {isWithdrawingOffer ? "Withdrawing..." : "Withdraw Offer"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Contract Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select a template</option>
                {contractTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.template_name || template.docuseal_template_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Signing Method</label>
              <select
                value={signingMethod}
                onChange={(e) => setSigningMethod(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="digital">Digital</option>
                <option value="in_person">In Person</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Internal Notes</label>
              <textarea
                value={offerNotes}
                onChange={(e) => setOfferNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes for the offer record"
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            {offerError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{offerError}</p>
            )}

            <button
              type="button"
              onClick={handleSendOffer}
              disabled={isSendingOffer || !selectedTemplateId}
              className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {isSendingOffer ? "Sending..." : "Send Job Offer"}
            </button>
          </>
        )}
      </div>

      {/* New Job Offer - Full Negotiation & DocuSeal */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-1">New Job Offer</p>
          <p className="text-xs text-text-secondary">
            Create a negotiable offer with digital signing via DocuSeal.
          </p>
        </div>

        {!showNewOfferForm ? (
          <button
            type="button"
            onClick={() => setShowNewOfferForm(true)}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Create New Offer
          </button>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Salary</label>
                <input
                  type="number"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="PHP">PHP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Employment Type</label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">Work Arrangement</label>
                <select
                  value={workArrangement}
                  onChange={(e) => setWorkArrangement(e.target.value as WorkSetup)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="onsite">Onsite</option>
                  <option value="wfh">WFH</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Expiry (days)</label>
              <input
                type="number"
                value={expiryDays}
                onChange={(e) => setExpiryDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                min="1"
                max="90"
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-text-tertiary">Offer expires in {expiryDays} days</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-text-secondary">Benefits</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  placeholder="e.g., Health insurance"
                  className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBenefit.trim()) {
                      setBenefits([...benefits, newBenefit.trim()]);
                      setNewBenefit("");
                    }
                  }}
                  className="rounded-xl border border-primary bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Add
                </button>
              </div>
              {benefits.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {benefits.map((benefit, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs"
                    >
                      <span>{benefit}</span>
                      <button
                        type="button"
                        onClick={() => setBenefits(benefits.filter((_, i) => i !== idx))}
                        className="text-primary hover:text-primary-dark"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {newOfferError && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{newOfferError}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewOfferForm(false)}
                className="flex-1 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewOffer}
                disabled={isCreatingOffer}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {isCreatingOffer ? "Creating..." : "Create & Send"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary mb-1">Actions</p>
          <p className="text-xs text-text-secondary">
            Manual HR status changes for this applicant.
          </p>
        </div>
        {nextActions.length > 0 ? (
          nextActions.map((action) => (
            <button
              key={action.status}
              onClick={() => handleStatusChange(action.status)}
              disabled={isLoading}
              className={`w-full py-3 px-4 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${action.color} hover:opacity-90`}
            >
              {action.label}
            </button>
          ))
        ) : (
          <p className="text-xs text-text-secondary">
            No manual actions are available for the current status.
          </p>
        )}
      </div>

      {/* Move to Applied Button - For Rejected Status */}
      {application?.status === "rejected" && (
        <div className="rounded-2xl border border-border bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-900 mb-2">Reconsider Candidate</p>
          <p className="text-xs text-amber-700 mb-4">
            Move this candidate back to active consideration. They will receive a notification.
          </p>
          <button
            onClick={() => handleStatusChange("submitted")}
            disabled={isLoading}
            className="w-full py-3 px-4 text-sm font-medium text-white rounded-lg bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            Move to Active Consideration
          </button>
        </div>
      )}

      {/* Schedule Interview Button */}
      {application?.status === "shortlisted" && (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm font-semibold text-text-primary mb-3">Schedule Interview</p>
          <p className="text-xs text-text-secondary mb-3">
            Schedule after the candidate confirms their format selection.
          </p>
          <a
            href={`/interviews/schedule?applicationId=${application.id}`}
            className="block w-full rounded-lg bg-purple-500 px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-purple-600"
          >
            Open Scheduling
          </a>
        </div>
      )}

      {/* Candidate Info Card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-xs font-medium uppercase text-text-secondary mb-4">Timeline</p>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Status:</span>
            <span className="text-text-primary font-medium capitalize">{config.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Submitted:</span>
            <span className="text-text-primary font-medium">
              {new Date(application?.submitted_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Last Updated:</span>
            <span className="text-text-primary font-medium">
              {new Date(application?.updated_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Days in Pipeline:</span>
            <span className="text-text-primary font-medium">
              {Math.floor(
                (new Date().getTime() - new Date(application?.submitted_at).getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{" "}
              days
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
