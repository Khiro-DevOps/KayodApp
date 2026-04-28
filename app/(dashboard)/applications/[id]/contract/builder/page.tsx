"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateContract } from "@/app/api/job-offers/actions";
import { AlertCircle, Loader, FileText, Send } from "lucide-react";

interface ContractTemplate {
  id: string;
  name: string;
  html_template: string;
}

interface JobOfferProposal {
  id: string;
  base_salary: number;
  start_date: string;
  position_title: string;
  benefits_summary: string | null;
  other_terms: Record<string, unknown>;
}

export default function ContractBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;
  const supabase = createClient();

  const [proposal, setProposal] = useState<JobOfferProposal | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [contractHtml, setContractHtml] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [applicationId]);

  const loadData = async () => {
    try {
      // Get job offer proposal
      const { data: proposals } = await supabase
        .from("job_offer_proposals")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!proposals || proposals.length === 0) {
        setError("Job offer not found");
        return;
      }

      const prop = proposals[0];
      setProposal(prop);

      // Get templates
      const { data: tmpl } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("is_active", true);

      if (tmpl && tmpl.length > 0) {
        setTemplates(tmpl);
        setSelectedTemplateId(tmpl[0].id);
        generatePreview(tmpl[0], prop);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = (template: ContractTemplate, prop: JobOfferProposal) => {
    let html = template.html_template;

    // Replace placeholders
    const formatSalary = (salary: number) => {
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 0,
      }).format(salary);
    };

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    html = html.replace(/\{\{baseSalary\}\}/g, formatSalary(prop.base_salary));
    html = html.replace(
      /\{\{startDate\}\}/g,
      formatDate(prop.start_date)
    );
    html = html.replace(/\{\{positionTitle\}\}/g, prop.position_title);
    html = html.replace(
      /\{\{benefitsSummary\}\}/g,
      prop.benefits_summary || "As per company policy"
    );

    setContractHtml(html);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template && proposal) {
      generatePreview(template, proposal);
      setEditMode(false);
    }
  };

  const handleSendContract = async (send: boolean) => {
    if (!proposal || !selectedTemplateId) {
      setError("Please select a template first");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const customEdits = editMode ? contractHtml : undefined;
      await generateContract(
        proposal.id,
        selectedTemplateId,
        customEdits,
        send
      );

      setSuccess(
        send
          ? "Contract sent to candidate!"
          : "Contract saved as draft!"
      );

      // Redirect after 2 seconds
      setTimeout(() => router.push(`/applications/${applicationId}`), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate contract");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading contract builder...</p>
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
            Error
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800">Contract Builder</h1>
          <p className="text-gray-600 mt-2">
            Generate and customize employment contract
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

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Sidebar - Controls */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Contract Settings
              </h2>

              {/* Template Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={editMode || submitting}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {templates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Edit Mode Toggle */}
              <div className="mb-6">
                <button
                  onClick={() => setEditMode(!editMode)}
                  disabled={submitting}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition ${
                    editMode
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  {editMode ? "Exit Edit Mode" : "Edit Contract"}
                </button>
              </div>

              {editMode && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 mb-6">
                  <p className="font-medium mb-1">✏️ Edit Mode</p>
                  <p>You can now edit the contract HTML directly.</p>
                </div>
              )}

              {/* Job Offer Info */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-6">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">
                  Job Offer Info
                </h3>
                <div className="text-sm space-y-2 text-gray-700">
                  <div>
                    <p className="text-gray-600">Position</p>
                    <p className="font-medium">{proposal.position_title}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Salary</p>
                    <p className="font-medium">
                      ₱{proposal.base_salary.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Start Date</p>
                    <p className="font-medium">
                      {new Date(proposal.start_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => handleSendContract(false)}
                  disabled={submitting}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition"
                >
                  {submitting ? "Processing..." : "Save as Draft"}
                </button>
                <button
                  onClick={() => handleSendContract(true)}
                  disabled={submitting}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? "Sending..." : "Send to Candidate"}
                </button>
              </div>
            </div>
          </div>

          {/* Main Content - Contract Preview/Editor */}
          <div className="lg:col-span-2">
            {editMode ? (
              /* Edit Mode */
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-red-50 border-b px-6 py-3">
                  <p className="text-sm text-red-800 font-medium">
                    ✏️ Editing HTML - Be careful with your changes
                  </p>
                </div>
                <textarea
                  value={contractHtml}
                  onChange={(e) => setContractHtml(e.target.value)}
                  className="w-full p-6 font-mono text-sm focus:outline-none resize-none"
                  style={{ minHeight: "600px" }}
                  disabled={submitting}
                />
              </div>
            ) : (
              /* Preview Mode */
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-blue-50 border-b px-6 py-3">
                  <p className="text-sm text-blue-800 font-medium">
                    👁️ Contract Preview
                  </p>
                </div>
                <div
                  className="p-8 min-h-96 max-h-96 overflow-auto text-sm leading-relaxed prose prose-sm"
                  dangerouslySetInnerHTML={{ __html: contractHtml }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-sm text-blue-800">
            <strong>ℹ️ About Contract Builder:</strong> Select a template, review
            the auto-filled information from the job offer, and make any necessary
            edits. Click "Edit Contract" to modify the HTML directly. When ready,
            save as draft or send directly to the candidate.
          </p>
        </div>
      </div>
    </div>
  );
}
