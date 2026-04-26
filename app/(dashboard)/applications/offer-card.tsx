"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface JobOffer {
  id: string;
  status: string;
  position_title: string;
  department: string | null;
  employment_type: string;
  salary_amount: number | null;
  salary_currency: string;
  pay_frequency: string;
  benefits: string[];
  work_setup: string;
  work_location: string | null;
  work_schedule: string | null;
  employment_terms: string | null;
  start_date: string | null;
  offer_expires_at: string | null;
  signed_at: string | null;
  signature_data: string | null;
}

interface OfferCardProps {
  offer: JobOffer;
  applicationId: string;
}

export default function OfferCard({ offer, applicationId }: OfferCardProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState(offer.status);

  // Countdown to expiry
  const expiryDate = offer.offer_expires_at ? new Date(offer.offer_expires_at) : null;
  const now = new Date();
  const daysLeft = expiryDate
    ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isExpired = expiryDate ? now > expiryDate : false;

  // ── Signature canvas ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSignModal || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [showSignModal]);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSigned(true);
  }

  function stopDraw() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  }

  // ── Accept with signature ────────────────────────────────────────────────
  async function handleAccept() {
    if (!hasSigned || !accepted) return;
    setSubmitting(true);
    const supabase = createClient();

    const signatureData = canvasRef.current?.toDataURL("image/png") ?? null;

    await supabase
      .from("job_offers")
      .update({
        status: "accepted",
        signed_at: new Date().toISOString(),
        signature_data: signatureData,
      })
      .eq("id", offer.id);

    await supabase
      .from("applications")
      .update({ status: "hired" })
      .eq("id", applicationId);

    setLocalStatus("accepted");
    setShowSignModal(false);
    setSubmitting(false);
    router.refresh();

    // Notify HR that offer was accepted
    const { data: offerData } = await supabase
    .from("job_offers")
    .select("created_by, position_title")
    .eq("id", offer.id)
    .single();

    if (offerData?.created_by) {
    await supabase.from("notifications").insert({
        recipient_id: offerData.created_by,
        type: "offer_accepted",
        title: "🎉 Offer Accepted!",
        body: `A candidate has accepted the job offer for ${offerData.position_title}.`,
        action_url: `/jobs/manage`,
        is_read: false,
    });
    }
  }


  // ── Decline ──────────────────────────────────────────────────────────────
  async function handleDecline() {
    setSubmitting(true);
    const supabase = createClient();

    await supabase
      .from("job_offers")
      .update({
        status: "declined",
        decline_reason: declineReason || null,
      })
      .eq("id", offer.id);

    await supabase
      .from("applications")
      .update({ status: "rejected" })
      .eq("id", applicationId);

    setLocalStatus("declined");
    setShowDeclineModal(false);
    setSubmitting(false);
    router.refresh();
    
    // Notify HR that offer was declined
    const { data: offerData } = await supabase
    .from("job_offers")
    .select("created_by, position_title")
    .eq("id", offer.id)
    .single();

    if (offerData?.created_by) {
    await supabase.from("notifications").insert({
        recipient_id: offerData.created_by,
        type: "offer_declined",
        title: "❌ Offer Declined",
        body: `A candidate has declined the job offer for ${offerData.position_title}${declineReason ? `: "${declineReason}"` : "."}`,
        action_url: `/jobs/manage`,
        is_read: false,
    });
    }
  }

  const payFrequencyLabel: Record<string, string> = {
    monthly: "/ month",
    semi_monthly: "/ semi-month",
    weekly: "/ week",
  };

  const workSetupLabel: Record<string, string> = {
    on_site: "🏢 On-site",
    hybrid: "🔀 Hybrid",
    remote: "🏠 Remote",
  };

  // ── Already responded ────────────────────────────────────────────────────
  if (localStatus === "accepted") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 space-y-2">
        <div className="text-3xl">✅</div>
        <p className="text-sm font-bold text-green-800">You accepted the job offer!</p>
        <p className="text-xs text-green-700">
          Congratulations! The HR team will reach out with your onboarding details soon.
        </p>
        {offer.signed_at && (
          <p className="text-xs text-green-600">
            Signed on{" "}
            {new Date(offer.signed_at).toLocaleDateString("en-PH", {
              month: "long", day: "numeric", year: "numeric",
            })}
          </p>
        )}
      </div>
    );
  }

  if (localStatus === "declined") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-2">
        <div className="text-3xl">❌</div>
        <p className="text-sm font-bold text-red-800">You declined this job offer.</p>
        <p className="text-xs text-red-700">
          Thank you for letting us know. We wish you all the best in your career.
        </p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 space-y-2">
        <div className="text-3xl">⏰</div>
        <p className="text-sm font-bold text-text-primary">This offer has expired.</p>
        <p className="text-xs text-text-secondary">
          The offer deadline has passed. Please contact HR if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── Main offer card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary/30 bg-surface p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎉</span>
              <h3 className="text-base font-bold text-text-primary">Job Offer</h3>
            </div>
            <p className="text-xs text-text-secondary">
              Please review the details below and respond before the deadline.
            </p>
          </div>
          {daysLeft !== null && (
            <div className={`shrink-0 rounded-xl px-3 py-1.5 text-center ${
              daysLeft <= 2 ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
            }`}>
              <p className={`text-lg font-bold ${daysLeft <= 2 ? "text-red-600" : "text-amber-700"}`}>
                {daysLeft}d
              </p>
              <p className={`text-[10px] ${daysLeft <= 2 ? "text-red-500" : "text-amber-600"}`}>
                left to respond
              </p>
            </div>
          )}
        </div>

        {/* Position */}
        <div className="rounded-xl bg-gray-50 border border-border p-4 space-y-3">
          <div>
            <p className="text-xs text-text-secondary">Position</p>
            <p className="text-sm font-bold text-text-primary">{offer.position_title}</p>
            {offer.department && (
              <p className="text-xs text-text-secondary">{offer.department}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
              {offer.employment_type.replace(/_/g, " ")}
            </span>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {workSetupLabel[offer.work_setup] ?? offer.work_setup}
            </span>
          </div>
        </div>

        {/* Compensation */}
        {offer.salary_amount && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-secondary">Basic Salary</p>
            <p className="text-2xl font-bold text-text-primary">
              {offer.salary_currency}{" "}
              {offer.salary_amount.toLocaleString()}
              <span className="text-sm font-normal text-text-secondary ml-1">
                {payFrequencyLabel[offer.pay_frequency] ?? ""}
              </span>
            </p>
          </div>
        )}

        {/* Benefits */}
        {offer.benefits && offer.benefits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Benefits</p>
            <div className="flex flex-wrap gap-1.5">
              {offer.benefits.map((b) => (
                <span
                  key={b}
                  className="rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs text-green-700"
                >
                  ✓ {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Work details */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {offer.work_location && (
            <div>
              <p className="text-text-secondary mb-0.5">Location</p>
              <p className="text-text-primary font-medium">{offer.work_location}</p>
            </div>
          )}
          {offer.work_schedule && (
            <div>
              <p className="text-text-secondary mb-0.5">Schedule</p>
              <p className="text-text-primary font-medium">{offer.work_schedule}</p>
            </div>
          )}
          {offer.start_date && (
            <div>
              <p className="text-text-secondary mb-0.5">Start Date</p>
              <p className="text-text-primary font-medium">
                {new Date(offer.start_date).toLocaleDateString("en-PH", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </p>
            </div>
          )}
          {offer.offer_expires_at && (
            <div>
              <p className="text-text-secondary mb-0.5">Offer Expires</p>
              <p className="text-text-primary font-medium">
                {new Date(offer.offer_expires_at).toLocaleDateString("en-PH", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </p>
            </div>
          )}
        </div>

        {/* Employment Terms */}
        {offer.employment_terms && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-secondary">Employment Terms</p>
            <div className="rounded-xl bg-gray-50 border border-border px-4 py-3 text-xs text-text-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
              {offer.employment_terms}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => setShowDeclineModal(true)}
            className="flex-1 rounded-xl border border-red-200 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={() => setShowSignModal(true)}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Review & Sign
          </button>
        </div>
      </div>

      {/* ── Signature Modal ──────────────────────────────────────────────── */}
      {showSignModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[80]"
            onClick={() => setShowSignModal(false)}
          />
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
            <div
              className="w-full max-w-md bg-surface rounded-2xl border border-border shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-sm font-bold text-text-primary">Sign & Accept Offer</h3>
                <button
                  onClick={() => setShowSignModal(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <p className="text-xs text-text-secondary">
                  By signing below, you confirm that you have read and agreed to the terms of this job offer.
                </p>

                {/* Signature canvas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-text-secondary">
                      Draw your signature
                    </label>
                    <button
                      onClick={clearCanvas}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={380}
                    height={140}
                    className="w-full rounded-xl border-2 border-dashed border-border bg-gray-50 touch-none cursor-crosshair"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                  {!hasSigned && (
                    <p className="text-xs text-text-secondary text-center">
                      Sign in the box above using your mouse or finger
                    </p>
                  )}
                </div>

                {/* Acceptance checkbox */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-border accent-primary"
                  />
                  <span className="text-xs text-text-secondary">
                    I have read and agree to the employment terms and conditions stated in this Job Offer.
                  </span>
                </label>

                <button
                  onClick={handleAccept}
                  disabled={!hasSigned || !accepted || submitting}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting..." : "Sign & Accept Offer"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Decline Modal ────────────────────────────────────────────────── */}
      {showDeclineModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[80]"
            onClick={() => setShowDeclineModal(false)}
          />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div
              className="w-full max-w-sm bg-surface rounded-2xl border border-border shadow-xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-text-primary">Decline this offer?</h3>
              <p className="text-xs text-text-secondary">
                This action cannot be undone. You may optionally share why you're declining.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  Reason (optional)
                </label>
                <textarea
                  rows={3}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Accepted another offer, salary expectation mismatch..."
                  className="w-full rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeclineModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDecline}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                >
                  {submitting ? "Declining..." : "Decline Offer"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}