"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  acceptJobOfferProposal,
  requestRenegotiation,
} from "@/app/api/job-offers/actions";
import { DollarSign, Calendar, Briefcase, AlertCircle, Loader } from "lucide-react";

interface JobOfferProposal {
  id: string;
  base_salary: number;
  start_date: string;
  position_title: string;
  benefits_summary: string | null;
  other_terms: Record<string, unknown>;
  proposal_status: string;
  created_at: string;
  previous_proposal_id: string | null;
}

export default function JobOfferReviewPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;
  const supabase = createClient();

  const [proposal, setProposal] = useState<JobOfferProposal | null>(null);
  const [previousProposals, setPreviousProposals] = useState<JobOfferProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showRenegotiationForm, setShowRenegotiationForm] = useState(false);
  const [renegotiationReason, setRenegotiationReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadOfferDetails();
  }, [applicationId]);

  const loadOfferDetails = async () => {
    try {
      // Get latest job offer proposal
      const { data: proposals, error: proposalError } = await supabase
        .from("job_offer_proposals")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false });

      if (proposalError) throw proposalError;

      if (!proposals || proposals.length === 0) {
        setError("No job offer found for this application");
        return;
      }

      const latest = proposals[0];
      setProposal(latest);

      // Load proposal history
      if (proposals.length > 1) {
        setPreviousProposals(proposals.slice(1));
      }
    } catch (err) {
      console.error("Error loading offer:", err);
      setError(err instanceof Error ? err.message : "Failed to load offer");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!proposal) return;

    try {
      setSubmitting(true);
      setError(null);
      await acceptJobOfferProposal(proposal.id);
      setSuccess("Offer accepted! Moving to contract signing...");

      // Redirect to contract page after 2 seconds
      setTimeout(
        () => router.push(`/applications/${applicationId}/contract/sign`),
        2000
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept offer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRenegotiation = async () => {
    if (!proposal || !renegotiationReason.trim()) {
      setError("Please provide a reason for renegotiation");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await requestRenegotiation(proposal.id, renegotiationReason);
      setSuccess("Renegotiation requested! HR will review your request.");
      setShowRenegotiationForm(false);
      setRenegotiationReason("");

      // Reload after 2 seconds
      setTimeout(() => loadOfferDetails(), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to request renegotiation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading your job offer...</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
          <h1 className="text-lg font-semibold text-gray-800 mb-2">
            No Job Offer Found
          </h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push("/applications")}
            className="text-blue-600 hover:underline"
          >
            ← Back to Applications
          </button>
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
          <h1 className="text-3xl font-bold text-gray-800">Job Offer Review</h1>
          <p className="text-gray-600 mt-2">
            Please review the offer details and provide your response
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

        {/* Proposal Status Badge */}
        {proposal.proposal_status === "renegotiate" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 font-medium">
              ⚠️ This is a revised offer following your renegotiation request
            </p>
          </div>
        )}

        {/* Offer Details Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <h2 className="text-2xl font-bold">{proposal.position_title}</h2>
            <p className="text-blue-100 mt-1">
              Effective from {formatDate(proposal.start_date)}
            </p>
          </div>

          <div className="p-6">
            {/* Key Details Grid */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Salary */}
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-600">
                    Base Salary
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-800">
                  {formatCurrency(proposal.base_salary)}
                </p>
                <p className="text-xs text-gray-600 mt-1">per month</p>
              </div>

              {/* Start Date */}
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-600">
                    Start Date
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-800">
                  {formatDate(proposal.start_date)}
                </p>
              </div>

              {/* Position Type */}
              <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-gray-600">
                    Employment Type
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-800">Full-time</p>
              </div>
            </div>

            {/* Benefits */}
            {proposal.benefits_summary && (
              <div className="bg-gray-50 rounded-lg p-6 mb-8">
                <h3 className="font-semibold text-gray-800 mb-3">Benefits</h3>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {proposal.benefits_summary}
                </p>
              </div>
            )}

            {/* Other Terms */}
            {proposal.other_terms &&
              Object.keys(proposal.other_terms).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-6 mb-8">
                  <h3 className="font-semibold text-gray-800 mb-3">
                    Additional Terms
                  </h3>
                  <ul className="space-y-2 text-gray-700">
                    {Object.entries(proposal.other_terms).map(([key, value]) => (
                      <li key={key} className="flex gap-2">
                        <span className="font-medium">•</span>
                        <span>
                          {key}: {String(value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </div>

        {/* Proposal History */}
        {previousProposals.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Proposal History
            </h3>
            <div className="space-y-4">
              {previousProposals.map((prev, idx) => (
                <div
                  key={prev.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <p className="text-sm text-gray-600">
                    Proposal {previousProposals.length - idx} (
                    {prev.proposal_status})
                  </p>
                  <p className="font-medium text-gray-800">
                    {formatCurrency(prev.base_salary)} • Start:{" "}
                    {formatDate(prev.start_date)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {proposal.proposal_status === "sent_to_candidate" && (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {/* Accept Button */}
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-4 rounded-lg transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  ✓ Accept Offer
                </>
              )}
            </button>

            {/* Renegotiate Button */}
            <button
              onClick={() => setShowRenegotiationForm(true)}
              disabled={submitting}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-semibold py-4 rounded-lg transition"
            >
              Request Changes
            </button>
          </div>
        )}

        {/* Renegotiation Form */}
        {showRenegotiationForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Request Renegotiation
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What would you like to discuss?
              </label>
              <textarea
                value={renegotiationReason}
                onChange={(e) => setRenegotiationReason(e.target.value)}
                placeholder="e.g., I'd like to discuss the start date, additional benefits, or other terms..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={5}
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleRequestRenegotiation}
                disabled={submitting || !renegotiationReason.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
              <button
                onClick={() => {
                  setShowRenegotiationForm(false);
                  setRenegotiationReason("");
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status Badge for Accepted/Rejected */}
        {(proposal.proposal_status === "accepted" ||
          proposal.proposal_status === "rejected") && (
          <div
            className={`rounded-lg p-6 text-center ${
              proposal.proposal_status === "accepted"
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <p
              className={`text-lg font-semibold ${
                proposal.proposal_status === "accepted"
                  ? "text-green-800"
                  : "text-red-800"
              }`}
            >
              {proposal.proposal_status === "accepted"
                ? "✓ Offer Accepted - Proceed to Contract Signing"
                : "✗ Offer Rejected"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
