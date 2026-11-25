"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
} from "lucide-react";
import {
  INCIDENT_STATUS_META,
  SANCTION_META,
  canSubmitExplanation,
  formatManilaDate,
  formatManilaDateTime,
  getNteCountdown,
  type DisciplinarySanction,
  type IncidentStatus,
} from "@/lib/incident-reports";
import {
  acknowledgeDisciplinaryNoticeAction,
  getDisciplinaryDocumentUrlAction,
  submitEmployeeExplanationAction,
} from "@/app/actions/incident-reports";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";
import DisciplinaryPdfViewer from "@/components/disciplinary/DisciplinaryPdfViewer";
import SignaturePad from "@/components/disciplinary/SignaturePad";

export interface EmployeeNoticeItem {
  id: string;
  caseNumber: string;
  incidentDate: string;
  offenseCategory: string;
  policyViolated: string | null;
  description: string;
  evidencePaths: string[];
  status: IncidentStatus;
  nteIssuedAt: string | null;
  nteDeadlineAt: string | null;
  nteDocumentPath: string | null;
  nteHrSignatureName: string | null;
  nteHrSignedAt: string | null;
  nteAcknowledgedAt: string | null;
  nteDocumentSha256: string | null;
  employeeExplanation: string | null;
  explanationSubmittedAt: string | null;
  explanationAttachments: string[];
  sanctionType: DisciplinarySanction | null;
  suspensionDays: number | null;
  suspensionStartDate: string | null;
  suspensionEndDate: string | null;
  resolutionNotes: string | null;
  decisionDocumentPath: string | null;
  decisionHrSignatureName: string | null;
  decisionHrSignedAt: string | null;
  decisionAcknowledgedAt: string | null;
  decisionDocumentSha256: string | null;
  resolvedAt: string | null;
}

function isPdfPath(path: string): boolean {
  return path.toLowerCase().split("?")[0].endsWith(".pdf");
}

export default function NoticesClient({
  notices,
  initialCaseId,
  employeeName = "",
}: {
  notices: EmployeeNoticeItem[];
  initialCaseId: string | null;
  employeeName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const defaultId = useMemo(() => {
    if (initialCaseId && notices.some((n) => n.id === initialCaseId)) {
      return initialCaseId;
    }
    return notices[0]?.id ?? null;
  }, [initialCaseId, notices]);

  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const [explanationText, setExplanationText] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [nteSignatureUrl, setNteSignatureUrl] = useState<string | null>(null);
  const [decisionSignatureUrl, setDecisionSignatureUrl] = useState<string | null>(
    null
  );

  useEffect(() => {
    setNteSignatureUrl(null);
    setDecisionSignatureUrl(null);
  }, [selectedId]);

  const activeNotice = useMemo(
    () => notices.find((n) => n.id === selectedId) ?? null,
    [notices, selectedId]
  );

  const handleAcknowledgeNotice = (
    incidentId: string,
    noticeType: "nte" | "decision"
  ) => {
    const signatureDataUrl =
      noticeType === "nte" ? nteSignatureUrl : decisionSignatureUrl;
    if (!signatureDataUrl) {
      toast.error("Please provide your digital signature first.");
      return;
    }
    startTransition(async () => {
      const res = await acknowledgeDisciplinaryNoticeAction({
        incidentId,
        noticeType,
        signatureDataUrl,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to record acknowledgment.");
        return;
      }
      toast.success(res.message ?? "Receipt acknowledged.");
      if (noticeType === "nte") setNteSignatureUrl(null);
      else setDecisionSignatureUrl(null);
      router.refresh();
    });
  };

  const handleOpenNonPdf = (caseId: string, filePath: string) => {
    startTransition(async () => {
      const res = await getDisciplinaryDocumentUrlAction({ caseId, filePath });
      if (!res.success || !res.data?.url) {
        toast.error(res.error ?? "Unable to open attachment.");
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleSubmitExplanation = (e: React.FormEvent, caseId: string) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("caseId", caseId);
    fd.set("explanation", explanationText.trim());
    for (const f of attachmentFiles) {
      fd.append("attachments", f);
    }

    startTransition(async () => {
      const res = await submitEmployeeExplanationAction(fd);
      if (!res.success) {
        toast.error(res.error ?? "Failed to submit written explanation.");
        return;
      }
      toast.success(res.message ?? "Written explanation submitted.");
      setExplanationText("");
      setAttachmentFiles([]);
      router.refresh();
    });
  };

  const activeCountdown = activeNotice?.nteDeadlineAt
    ? getNteCountdown(activeNotice.nteDeadlineAt)
    : null;

  return (
    <div className="w-full space-y-6 pb-8">
      {/* Kayod Flushed Navy Hero Banner (Matching /employee/schedule & /employee/dashboard) */}
      <PwaHeroBanner
        eyebrow="Due Process & Compliance"
        title="Disciplinary Notices & Explanations"
        subtitle="Review formal Notices to Explain (NTE), submit your written explanation within the 5-calendar-day window, and view HR's Notice of Decision."
        className="bg-[#1C1A4E]"
        actions={
          notices.length > 1 ? (
            <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur-md">
              {notices.map((n) => {
                const selected = n.id === activeNotice?.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedId(n.id)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selected
                        ? "bg-white text-[#1C1A4E] shadow-xs"
                        : "text-indigo-100 hover:bg-white/10 hover:text-white"
                      }`}
                  >
                    {n.caseNumber}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      >
        {activeNotice ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {/* Pill 1: Case Reference */}
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Case Reference
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-bold text-[#1C1A4E]">
                  {activeNotice.caseNumber}
                </span>
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${INCIDENT_STATUS_META[activeNotice.status].badgeClass
                    }`}
                >
                  {INCIDENT_STATUS_META[activeNotice.status].label}
                </span>
              </div>
            </div>

            {/* Pill 2: Offense & Incident Date */}
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Offense &amp; Incident Date
              </p>
              <p className="mt-1.5 truncate text-sm font-bold text-[#1C1A4E]">
                {activeNotice.offenseCategory}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {formatManilaDate(activeNotice.incidentDate)}
                {activeNotice.policyViolated
                  ? ` · ${activeNotice.policyViolated}`
                  : ""}
              </p>
            </div>

            {/* Pill 3: 5-Calendar-Day Response Window */}
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                5-Calendar-Day Response Window
              </p>
              <p className="mt-1.5 truncate text-sm font-bold text-[#1C1A4E]">
                {activeNotice.nteDeadlineAt
                  ? formatManilaDateTime(activeNotice.nteDeadlineAt)
                  : "Pending NTE"}
              </p>
              <div className="mt-1">
                {activeNotice.status === "nte_issued" && activeCountdown ? (
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${activeCountdown.isOverdue
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                  >
                    <Clock className="h-3 w-3" />
                    {activeCountdown.label}
                  </span>
                ) : activeNotice.status === "explanation_submitted" ||
                  activeNotice.status === "under_review" ? (
                  <span className="inline-flex whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                    Submitted
                  </span>
                ) : (
                  <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Closed
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </PwaHeroBanner>

      {/* Main Content Container (Full Kayod Workspace Width) */}
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        {notices.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              No disciplinary notices on record
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              You currently have no active or historical Notices to Explain.
            </p>
          </div>
        ) : (
          activeNotice && (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              {/* Left Card: Notice to Explain (NTE) & Allegations */}
              <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-6">
                {/* Card Header (No squeezed text; action bar cleanly below header) */}
                <div className="space-y-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#595198]">
                      First Notice (NTE)
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                      Statement of Facts &amp; Allegations
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Issued {formatManilaDateTime(activeNotice.nteIssuedAt)}
                    </p>
                  </div>

                  {activeNotice.nteDocumentPath && (
                    <DisciplinaryPdfViewer
                      caseId={activeNotice.id}
                      filePath={activeNotice.nteDocumentPath}
                      versionKey={activeNotice.nteDocumentSha256}
                      title={`Notice to Explain (${activeNotice.caseNumber})`}
                      previewLabel="Preview NTE PDF"
                      downloadFileName={`NTE-${activeNotice.caseNumber}.pdf`}
                      variant="navy"
                    />
                  )}
                </div>

                {/* Statement of Facts Box */}
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {activeNotice.description}
                </div>

                {/* NTE Receipt Acknowledgment Card */}
                {activeNotice.nteIssuedAt && (
                  activeNotice.nteAcknowledgedAt ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        Receipt Acknowledged on{" "}
                        {formatManilaDateTime(activeNotice.nteAcknowledgedAt)}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-700">
                        Stamped on NTE PDF
                      </span>
                    </div>
                  ) : activeNotice.status === "nte_issued" ? (
                    <div className="space-y-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#595198]">
                          Electronic Receipt Acknowledgment
                        </p>
                        <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                          Acknowledge Receipt of NTE
                        </h3>
                      </div>

                      <SignaturePad
                        defaultName={employeeName}
                        label="Employee Receipt Signature"
                        disclaimer="My signature acknowledges receipt of this Notice to Explain only and does not constitute an admission of guilt or liability."
                        compact
                        disabled={isPending}
                        onChange={setNteSignatureUrl}
                      />

                      <button
                        type="button"
                        disabled={isPending || !nteSignatureUrl}
                        onClick={() =>
                          handleAcknowledgeNotice(activeNotice.id, "nte")
                        }
                        className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#1C1A4E] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#15133D] disabled:opacity-50 sm:w-auto"
                      >
                        <FileCheck2 className="h-4 w-4" />
                        {isPending
                          ? "Stamping PDF..."
                          : "Acknowledge NTE Receipt"}
                      </button>
                    </div>
                  ) : null
                )}

                {/* HR Evidence Attachments */}
                {activeNotice.evidencePaths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Supporting Evidence ({activeNotice.evidencePaths.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activeNotice.evidencePaths.map((path, idx) =>
                        isPdfPath(path) ? (
                          <DisciplinaryPdfViewer
                            key={path}
                            caseId={activeNotice.id}
                            filePath={path}
                            title={`Evidence #${idx + 1} (${activeNotice.caseNumber})`}
                            previewLabel={`Preview Evidence #${idx + 1}`}
                            variant="subtle"
                          />
                        ) : (
                          <button
                            key={path}
                            type="button"
                            onClick={() =>
                              handleOpenNonPdf(activeNotice.id, path)
                            }
                            className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1C1A4E]"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Evidence #{idx + 1}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Notice of Decision Section (Once Resolved / Dismissed) */}
                {(activeNotice.status === "resolved" ||
                  activeNotice.status === "dismissed") && (
                    <div className="space-y-3 border-t border-slate-100 pt-5">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                          Second Notice (Notice of Decision)
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Rendered {formatManilaDateTime(activeNotice.resolvedAt)}
                        </p>
                      </div>

                      {activeNotice.decisionDocumentPath && (
                        <DisciplinaryPdfViewer
                          caseId={activeNotice.id}
                          filePath={activeNotice.decisionDocumentPath}
                          versionKey={activeNotice.decisionDocumentSha256}
                          title={`Notice of Decision (${activeNotice.caseNumber})`}
                          previewLabel="Preview Decision PDF"
                          downloadFileName={`Decision-${activeNotice.caseNumber}.pdf`}
                          variant="emerald"
                        />
                      )}
                    </div>
                  )}
              </div>

              {/* Right Card: Written Explanation / Final Disposition */}
              <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-6">
                {canSubmitExplanation(activeNotice.status) ? (
                  <form
                    onSubmit={(e) => handleSubmitExplanation(e, activeNotice.id)}
                    className="space-y-5"
                  >
                    <div className="border-b border-slate-100 pb-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#595198]">
                        Employee Response
                      </p>
                      <h2 className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900">
                        <ShieldAlert className="h-5 w-5 text-[#1C1A4E]" />
                        Submit Written Explanation
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Your response is locked once submitted and forwarded
                        directly to HR for evaluation.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Written Explanation
                      </label>
                      <textarea
                        rows={6}
                        required
                        minLength={10}
                        value={explanationText}
                        onChange={(e) => setExplanationText(e.target.value)}
                        placeholder="State your side clearly and factually, including any relevant dates, context, or mitigating circumstances..."
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1C1A4E] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Supporting Attachments (Optional, max 10 MB each)
                      </label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) =>
                          setAttachmentFiles(Array.from(e.target.files ?? []))
                        }
                        className="mt-1.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border file:border-slate-200 file:bg-slate-50 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#1C1A4E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#15133D] disabled:opacity-50 sm:w-auto"
                    >
                      <Send className="h-4 w-4" />
                      {isPending
                        ? "Submitting..."
                        : "Submit Written Explanation"}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#595198]">
                          Employee Response
                        </p>
                        <h2 className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900">
                          <Lock className="h-4 w-4 text-slate-500" />
                          Written Explanation (Locked)
                        </h2>
                      </div>
                      {activeNotice.explanationSubmittedAt && (
                        <span className="text-xs text-slate-500">
                          Submitted{" "}
                          {formatManilaDateTime(
                            activeNotice.explanationSubmittedAt
                          )}
                        </span>
                      )}
                    </div>

                    <div className="whitespace-pre-wrap rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700">
                      {activeNotice.employeeExplanation ||
                        "No written explanation was submitted within the prescribed period."}
                    </div>

                    {activeNotice.explanationAttachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Your Attachments (
                          {activeNotice.explanationAttachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {activeNotice.explanationAttachments.map(
                            (path, idx) =>
                              isPdfPath(path) ? (
                                <DisciplinaryPdfViewer
                                  key={path}
                                  caseId={activeNotice.id}
                                  filePath={path}
                                  title={`Response Attachment #${idx + 1} (${activeNotice.caseNumber})`}
                                  previewLabel={`Preview Attachment #${idx + 1}`}
                                  variant="subtle"
                                />
                              ) : (
                                <button
                                  key={path}
                                  type="button"
                                  onClick={() =>
                                    handleOpenNonPdf(activeNotice.id, path)
                                  }
                                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1C1A4E]"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                  Attachment #{idx + 1}
                                </button>
                              )
                          )}
                        </div>
                      </div>
                    )}

                    {(activeNotice.status === "resolved" ||
                      activeNotice.status === "dismissed") && (
                        <div className="space-y-3 border-t border-slate-100 pt-5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                            Final Disposition &amp; Findings
                          </p>
                          {activeNotice.sanctionType && (
                            <div>
                              <span
                                className={`inline-flex whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-semibold ${SANCTION_META[activeNotice.sanctionType]
                                    .badgeClass
                                  }`}
                              >
                                {SANCTION_META[activeNotice.sanctionType].label}
                                {activeNotice.sanctionType === "suspension" &&
                                  activeNotice.suspensionDays
                                  ? ` (${activeNotice.suspensionDays} days)`
                                  : ""}
                              </span>
                            </div>
                          )}
                          {activeNotice.resolutionNotes && (
                            <div className="whitespace-pre-wrap rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 text-sm leading-relaxed text-slate-700">
                              {activeNotice.resolutionNotes}
                            </div>
                          )}

                          {/* Notice of Decision Receipt Acknowledgment */}
                          {activeNotice.decisionAcknowledgedAt ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                Receipt Acknowledged on{" "}
                                {formatManilaDateTime(
                                  activeNotice.decisionAcknowledgedAt
                                )}
                              </span>
                              <span className="text-[11px] font-medium text-emerald-700">
                                Stamped on Decision PDF
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4">
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                                  Electronic Receipt Acknowledgment
                                </p>
                                <h3 className="mt-0.5 text-sm font-bold text-slate-900">
                                  Acknowledge Receipt of Notice of Decision
                                </h3>
                              </div>

                              <SignaturePad
                                defaultName={employeeName}
                                label="Employee Receipt Signature"
                                disclaimer="My signature acknowledges receipt of this Notice of Decision."
                                compact
                                disabled={isPending}
                                onChange={setDecisionSignatureUrl}
                              />

                              <button
                                type="button"
                                disabled={isPending || !decisionSignatureUrl}
                                onClick={() =>
                                  handleAcknowledgeNotice(
                                    activeNotice.id,
                                    "decision"
                                  )
                                }
                                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50 sm:w-auto"
                              >
                                <FileCheck2 className="h-4 w-4" />
                                {isPending
                                  ? "Stamping PDF..."
                                  : "Acknowledge Decision Receipt"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
