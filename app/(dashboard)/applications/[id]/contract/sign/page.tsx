"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitContractSignature } from "@/app/api/job-offers/actions";
import { AlertCircle, Loader, Download, FileText } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

interface Contract {
  id: string;
  contract_html: string;
  contract_status: string;
  candidate_signed_name: string | null;
  signature_timestamp: string | null;
}

export default function ContractSignPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;
  const supabase = createClient();
  const signatureCanvasRef = useRef<SignatureCanvas>(null);

  const [contract, setContract] = useState<Contract | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSignatureWarning, setShowSignatureWarning] = useState(false);

  useEffect(() => {
    loadContractDetails();
  }, [applicationId]);

  const loadContractDetails = async () => {
    try {
      // Get latest contract for this application
      const { data: contracts, error: contractError } = await supabase
        .from("contracts")
        .select("*")
        .eq("job_offer_proposal_id", applicationId)
        .order("version_number", { ascending: false })
        .limit(1);

      if (contractError) throw contractError;

      if (!contracts || contracts.length === 0) {
        setError("No contract found for this application");
        return;
      }

      const latest = contracts[0];
      setContract(latest);

      // Pre-fill candidate name if already signed
      if (latest.candidate_signed_name) {
        setCandidateName(latest.candidate_signed_name);
      }
    } catch (err) {
      console.error("Error loading contract:", err);
      setError(err instanceof Error ? err.message : "Failed to load contract");
    } finally {
      setLoading(false);
    }
  };

  const handleClearSignature = () => {
    signatureCanvasRef.current?.clear();
    setShowSignatureWarning(false);
  };

  const handleSignContract = async () => {
    if (!contract) return;

    if (!candidateName.trim()) {
      setError("Please enter your name");
      return;
    }

    const signatureData = signatureCanvasRef.current?.toDataURL("image/png");
    if (!signatureData || signatureData === signatureCanvasRef.current?.getCanvas().toDataURL("image/png")) {
      setError("Please provide a signature");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await submitContractSignature(contract.id, signatureData, candidateName);
      setSuccess(
        "Contract signed successfully! HR will review and confirm your hire."
      );

      // Redirect to confirmation page after 3 seconds
      setTimeout(
        () => router.push(`/dashboard/onboarding/welcome`),
        3000
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign contract");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading your contract...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
          <h1 className="text-lg font-semibold text-gray-800 mb-2">
            Contract Not Found
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

  const isAlreadySigned = contract.contract_status === "signed";

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-800">
            Employment Contract
          </h1>
          <p className="text-gray-600 mt-2">
            {isAlreadySigned
              ? "✓ Contract Signed"
              : "Please review and sign your employment contract"}
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

        {isAlreadySigned && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-800 font-medium">
              ✓ This contract has already been signed on{" "}
              {contract.signature_timestamp &&
                new Date(contract.signature_timestamp).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Contract Display */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          {/* Contract Viewer */}
          <div className="p-8 min-h-96 max-h-96 overflow-auto border-b bg-gray-50">
            <div
              className="text-gray-800 text-sm leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: contract.contract_html }}
            />
          </div>

          {/* Signature Section */}
          {!isAlreadySigned && (
            <div className="p-8 space-y-6">
              {/* Candidate Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Full Name *
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="Enter your full name as you want it on the contract"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={submitting}
                />
              </div>

              {/* Signature Pad */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Digital Signature *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                  <SignatureCanvas
                    ref={signatureCanvasRef}
                    penColor="black"
                    canvasProps={{
                      className: "w-full h-32 cursor-crosshair",
                    }}
                  />
                </div>
                <button
                  onClick={handleClearSignature}
                  className="text-sm text-gray-600 hover:text-gray-800 mt-2"
                >
                  Clear Signature
                </button>
              </div>

              {/* Signature Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>📝 How to sign:</strong> Use your mouse or touchpad to
                  draw your signature in the box above. Make sure it looks
                  authentic and consistent with your legal signature.
                </p>
              </div>

              {/* Legal Acknowledgment */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Legal Notice:</strong> By signing this contract
                  digitally, you acknowledge that you have read and understand
                  all terms and conditions. This signature is legally binding.
                </p>
              </div>
            </div>
          )}

          {/* Already Signed Display */}
          {isAlreadySigned && (
            <div className="p-8 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">
                  ✓ Signed by: {contract.candidate_signed_name}
                </p>
                <p className="text-green-700 text-sm mt-1">
                  Signed on:{" "}
                  {contract.signature_timestamp &&
                    new Date(contract.signature_timestamp).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          {!isAlreadySigned && (
            <>
              <button
                onClick={() => router.back()}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 rounded-lg transition"
              >
                Back
              </button>
              <button
                onClick={handleSignContract}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    ✓ Sign & Submit Contract
                  </>
                )}
              </button>
            </>
          )}

          {isAlreadySigned && (
            <button
              onClick={() => router.push("/dashboard/payroll")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
            >
              Continue to Employee Dashboard
            </button>
          )}
        </div>

        {/* Document Info */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <div className="flex gap-4 items-start">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-gray-800">Contract Information</h3>
              <ul className="text-sm text-gray-600 mt-2 space-y-1">
                <li>• Version: {contract.version_number}</li>
                <li>• Status: {contract.contract_status.replace(/_/g, " ")}</li>
                <li>• Created: {new Date(contract.contract_html ? new Date().toISOString() : "").toLocaleDateString()}</li>
                <li>
                  • Questions?{" "}
                  <a
                    href="mailto:hr@kayod.com"
                    className="text-blue-600 hover:underline"
                  >
                    Contact HR
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
