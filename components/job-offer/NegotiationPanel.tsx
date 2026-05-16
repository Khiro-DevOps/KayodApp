"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { CheckCircle2, MessageCircle, SlidersHorizontal } from "lucide-react";

import type { NegotiationPayload, NegotiationIntent } from "@/lib/types";

interface NegotiationPanelProps {
  token: string;
  status: string;
  signSectionRef: RefObject<HTMLDivElement | null>;
}

type Intent = NegotiationIntent | "accept";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      {children}
    </div>
  );
}

function IntentButton({
  active,
  icon,
  title,
  description,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors min-w-0 ${
        active
          ? "border-info bg-blue-50 text-blue-700"
          : "border-border bg-background text-text-primary hover:border-info/60 hover:bg-surface"
      }`}
    >
      <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-text-secondary"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className={`block text-sm ${active ? "text-blue-700/80" : "text-text-secondary"}`}>{description}</span>
      </span>
    </button>
  );
}

function Confirmation({ intent }: { intent: Intent }) {
  const message =
    intent === "counter"
      ? "Your counter offer was sent to HR."
      : intent === "question"
        ? "Your question was sent to HR."
        : "Scroll down to sign your contract when you're ready.";

  return (
    <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
      <div>
        <p className="font-medium text-green-800">Sent to HR</p>
        <p className="text-sm text-green-700">{message}</p>
      </div>
    </div>
  );
}

export default function NegotiationPanel({ token, status, signSectionRef }: NegotiationPanelProps) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [counterSalary, setCounterSalary] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counterSalaryId = useMemo(() => `counter-salary-${token}`, [token]);
  const counterNoteId = useMemo(() => `counter-note-${token}`, [token]);
  const questionId = useMemo(() => `question-${token}`, [token]);
  const lastIntentRef = useRef<Intent | null>(null);

  useEffect(() => {
    if (intent === "accept") {
      signSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (intent && intent !== lastIntentRef.current) {
      setSubmitted(false);
      setError(null);
    }

    lastIntentRef.current = intent;
  }, [intent, signSectionRef]);

  const handleSubmitNegotiation = async () => {
    if (!intent || intent === "accept") {
      return;
    }

    if (intent === "counter" && !counterSalary.trim()) {
      setError("Please share the salary you are hoping for.");
      return;
    }

    if (intent === "question" && !question.trim()) {
      setError("Please type your question before sending.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: NegotiationPayload = {
      intent,
      counterSalary: intent === "counter" ? counterSalary.trim() : undefined,
      note: intent === "counter" ? counterNote.trim() || undefined : question.trim(),
    };

    try {
      const response = await fetch(`/api/offers/${token}/negotiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setSubmitted(true);
      setIntent(null);
      setCounterSalary("");
      setCounterNote("");
      setQuestion("");
    } catch {
      setError("Failed to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = status === "signed" || status === "expired" || status === "declined";

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-text-primary">Respond to the offer</h2>
        <p className="mt-1 text-sm text-text-secondary">Choose one path and continue inline without leaving the page.</p>
      </div>

      <div className="space-y-4 p-5">
        {submitted && <Confirmation intent={(lastIntentRef.current ?? intent ?? "question") as Intent} />}

        {!submitted && (
          <div className="space-y-3">
            <IntentButton
              active={intent === "accept"}
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Accept this offer as-is"
              description="Jump straight to the signing section below."
              ariaLabel="Accept this offer as-is"
              onClick={() => {
                setIntent("accept");
              }}
            />
            <IntentButton
              active={intent === "counter"}
              icon={<SlidersHorizontal className="h-4 w-4" />}
              title="Negotiate - request different terms"
              description="Ask for a different salary or leave a note for HR."
              ariaLabel="Negotiate and request different terms"
              onClick={() => setIntent("counter")}
            />
            <IntentButton
              active={intent === "question"}
              icon={<MessageCircle className="h-4 w-4" />}
              title="Ask a question before deciding"
              description="Clarify the role, benefits, or terms inline."
              ariaLabel="Ask a question before deciding"
              onClick={() => setIntent("question")}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {intent === "counter" && !submitted && !disabled && (
          <div className="space-y-3 rounded-md bg-slate-50 p-4">
            <Field label="What salary are you hoping for?" htmlFor={counterSalaryId}>
              <input
                id={counterSalaryId}
                type="text"
                placeholder="e.g. ₱140,000"
                value={counterSalary}
                onChange={(event) => setCounterSalary(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-info"
              />
            </Field>
            <Field label="Anything else to discuss? (optional)" htmlFor={counterNoteId}>
              <textarea
                id={counterNoteId}
                placeholder="e.g. remote work flexibility, start date, signing bonus..."
                rows={3}
                value={counterNote}
                onChange={(event) => setCounterNote(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-info"
              />
            </Field>
            <button
              type="button"
              onClick={handleSubmitNegotiation}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send counter offer"}
            </button>
          </div>
        )}

        {intent === "question" && !submitted && !disabled && (
          <div className="space-y-3 rounded-md bg-slate-50 p-4">
            <Field label="Your question" htmlFor={questionId}>
              <textarea
                id={questionId}
                placeholder="Ask anything about the role, benefits, team structure, or terms..."
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-info"
              />
            </Field>
            <button
              type="button"
              onClick={handleSubmitNegotiation}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send question"}
            </button>
          </div>
        )}

        {intent === "accept" && !submitted && !disabled && (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-text-secondary">
            Review the contract below. When you are ready, open the signing ceremony.
          </div>
        )}

        {disabled && (
          <div className="rounded-md border border-border bg-background p-4 text-sm text-text-secondary">
            This offer is no longer accepting changes.
          </div>
        )}
      </div>
    </section>
  );
}
