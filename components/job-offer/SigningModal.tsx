"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { DocusealForm } from "@docuseal/react";
import { X, CheckCircle } from "lucide-react";

interface SigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSigningComplete?: (data?: unknown) => void;
  embedSrc: string;
  jobTitle: string;
  companyName: string;
  candidateEmail: string;
}

// Height of the DocuSeal sandbox banner in px.
// Increase by 4px increments if the banner is still partially visible.
const BANNER_COVER_HEIGHT = 56;

export default function SigningModal({
  isOpen,
  onClose,
  onSigningComplete,
  embedSrc,
  jobTitle,
  companyName,
  candidateEmail,
}: SigningModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted || !embedSrc) return null;

  const steps = [
    { num: 1, label: "Review", short: "Review" },
    { num: 2, label: "Fill in details", short: "Details" },
    { num: 3, label: "Sign & submit", short: "Sign" },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 9999, overflow: "hidden" }}>
        <div
          className="flex-shrink-0 flex items-center justify-between border-b border-[#e8e8e4]"
          style={{ padding: "14px 20px" }}
        >
          <div>
            <p className="text-[14px] font-semibold text-[#111] leading-tight">
              Sign your offer letter
            </p>
            <p className="text-[12px] text-[#888] mt-0.5">
              {jobTitle} · {companyName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid #e8e8e4",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#888",
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="flex-shrink-0 flex items-center justify-center border-b border-[#e8e8e4] bg-[#fafaf8]"
          style={{ padding: "10px 20px", gap: 0 }}
        >
          {steps.map((step, i) => {
            const done = step.num < currentStep;
            const active = step.num === currentStep;

            return (
              <div key={step.num} className="flex items-center">
                <div className="flex items-center" style={{ gap: 6 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: done ? "#16a34a" : active ? "#111" : "#e8e8e4",
                      color: done || active ? "#fff" : "#888",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {done ? <CheckCircle size={12} /> : step.num}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 500 : 400,
                      color: done ? "#16a34a" : active ? "#111" : "#888",
                    }}
                  >
                    {isMobile ? step.short : step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    style={{
                      width: 24,
                      height: 1,
                      background: "#e8e8e4",
                      margin: "0 8px",
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div
          className="flex-shrink-0 flex items-center justify-center border-b border-[#bbf7d0] bg-[#f0fdf4]"
          style={{ padding: "7px 20px" }}
        >
          <p className="text-[12px] text-[#15803d] text-center">
            Scroll within the document to review, fill in your details,
            and add your signature before submitting.
          </p>
        </div>

        <div
          id="signing-modal-embed"
          ref={embedRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            position: "relative",
            width: "100%",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "sticky",
              top: 0,
              left: 0,
              right: 0,
              height: BANNER_COVER_HEIGHT,
              background: "#ffffff",
              zIndex: 10,
              pointerEvents: "none",
              marginBottom: `-${BANNER_COVER_HEIGHT}px`,
            }}
          />

          <DocusealForm
            src={embedSrc}
            email={candidateEmail}
            withTitle={false}
            onComplete={(data) => {
              setCurrentStep(3);
              onSigningComplete?.(data);
              window.setTimeout(() => onClose(), 1500);
            }}
          />
        </div>
      </div>
    </>,
    document.body
  );
}