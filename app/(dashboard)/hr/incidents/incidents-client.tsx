"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  DISCIPLINARY_SANCTIONS,
  INCIDENT_STATUS_META,
  OFFENSE_CATEGORIES,
  SANCTION_META,
  canIssueNte,
  canResolveCase,
  computeNteDeadline,
  formatManilaDate,
  formatManilaDateTime,
  getNteCountdown,
  type DisciplinarySanction,
  type IncidentStatus,
} from "@/lib/incident-reports";
import {
  createIncidentReportAction,
  getDisciplinaryDocumentUrlAction,
  issueNoticeToExplainAction,
  resolveIncidentReportAction,
} from "@/app/actions/incident-reports";
import DisciplinaryPdfViewer from "@/components/disciplinary/DisciplinaryPdfViewer";
import SignaturePad from "@/components/disciplinary/SignaturePad";

export interface IncidentCaseRow {
  id: string;
  caseNumber: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  employeeJobTitle: string;
  employeeDepartment: string;
  reportedByName: string;
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
  createdAt: string;
}

export interface HrEmployeeOption {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  jobTitle: string;
  departmentName: string;
}

type FilterTab =
  | "all"
  | "draft"
  | "nte_issued"
  | "for_decision"
  | "closed";

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "nte_issued", label: "Awaiting Explanation" },
  { key: "for_decision", label: "For Decision" },
  { key: "closed", label: "Resolved / Dismissed" },
];

export default function IncidentsClient({
  initialCases,
  employees,
  initialCaseId,
  currentHrName = "HR Administration",
}: {
  initialCases: IncidentCaseRow[];
  employees: HrEmployeeOption[];
  initialCaseId: string | null;
  currentHrName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    initialCaseId
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedCaseId && !isLogModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isLogModalOpen) setIsLogModalOpen(false);
        else setSelectedCaseId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCaseId, isLogModalOpen]);

  // Log IR form state
  const [newEmployeeId, setNewEmployeeId] = useState(employees[0]?.id ?? "");
  const [newIncidentDate, setNewIncidentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newOffenseCategory, setNewOffenseCategory] = useState<string>(
    OFFENSE_CATEGORIES[0]
  );
  const [newPolicyViolated, setNewPolicyViolated] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEvidenceFiles, setNewEvidenceFiles] = useState<File[]>([]);

  // Final Decision form state
  const [decisionOutcome, setDecisionOutcome] = useState<"resolved" | "dismissed">(
    "resolved"
  );
  const [decisionSanction, setDecisionSanction] =
    useState<DisciplinarySanction>("written_warning");
  const [suspensionDays, setSuspensionDays] = useState<string>("3");
  const [suspensionStartDate, setSuspensionStartDate] = useState("");
  const [suspensionEndDate, setSuspensionEndDate] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [nteHrSignatureUrl, setNteHrSignatureUrl] = useState<string | null>(null);
  const [decisionHrSignatureUrl, setDecisionHrSignatureUrl] = useState<string | null>(
    null
  );

  useEffect(() => {
    setNteHrSignatureUrl(null);
    setDecisionHrSignatureUrl(null);
  }, [selectedCaseId]);

  const selectedCase = useMemo(
    () => initialCases.find((c) => c.id === selectedCaseId) ?? null,
    [initialCases, selectedCaseId]
  );

  const counts = useMemo(() => {
    return {
      all: initialCases.length,
      draft: initialCases.filter((c) => c.status === "draft").length,
      nte_issued: initialCases.filter((c) => c.status === "nte_issued").length,
      for_decision: initialCases.filter((c) => {
        if (
          c.status === "explanation_submitted" ||
          c.status === "under_review"
        ) {
          return true;
        }
        if (c.status === "nte_issued" && c.nteDeadlineAt) {
          return getNteCountdown(c.nteDeadlineAt).isOverdue;
        }
        return false;
      }).length,
      closed: initialCases.filter(
        (c) => c.status === "resolved" || c.status === "dismissed"
      ).length,
    };
  }, [initialCases]);

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return initialCases.filter((c) => {
      if (activeTab === "draft" && c.status !== "draft") return false;
      if (activeTab === "nte_issued" && c.status !== "nte_issued") return false;
      if (activeTab === "for_decision") {
        const isLapsedNte =
          c.status === "nte_issued" &&
          c.nteDeadlineAt &&
          getNteCountdown(c.nteDeadlineAt).isOverdue;
        if (
          c.status !== "explanation_submitted" &&
          c.status !== "under_review" &&
          !isLapsedNte
        ) {
          return false;
        }
      }
      if (
        activeTab === "closed" &&
        c.status !== "resolved" &&
        c.status !== "dismissed"
      ) {
        return false;
      }

      if (!q) return true;
      return (
        c.caseNumber.toLowerCase().includes(q) ||
        c.employeeName.toLowerCase().includes(q) ||
        c.offenseCategory.toLowerCase().includes(q) ||
        (c.employeeDepartment ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialCases, activeTab, searchQuery]);

  const previewDeadline = useMemo(() => computeNteDeadline(new Date()), []);

  const handleOpenDocument = (caseId: string, filePath: string) => {
    startTransition(async () => {
      const res = await getDisciplinaryDocumentUrlAction({ caseId, filePath });
      if (!res.success || !res.data?.url) {
        toast.error(res.error ?? "Could not open document.");
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleCreateIr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeId) {
      toast.error("Please select an employee.");
      return;
    }

    const fd = new FormData();
    fd.set("employeeId", newEmployeeId);
    fd.set("incidentDate", newIncidentDate);
    fd.set("offenseCategory", newOffenseCategory);
    if (newPolicyViolated.trim()) {
      fd.set("policyViolated", newPolicyViolated.trim());
    }
    fd.set("description", newDescription.trim());
    for (const f of newEvidenceFiles) {
      fd.append("evidence", f);
    }

    startTransition(async () => {
      const res = await createIncidentReportAction(fd);
      if (!res.success) {
        toast.error(res.error ?? "Failed to log incident report.");
        return;
      }
      toast.success(res.message ?? "Incident report logged.");
      setIsLogModalOpen(false);
      setNewPolicyViolated("");
      setNewDescription("");
      setNewEvidenceFiles([]);
      if (res.data?.id) {
        setSelectedCaseId(res.data.id);
      }
      router.refresh();
    });
  };

  const handleIssueNte = (caseId: string) => {
    if (!nteHrSignatureUrl) {
      toast.error("Please sign the Notice to Explain before issuing.");
      return;
    }
    startTransition(async () => {
      const res = await issueNoticeToExplainAction({
        caseId,
        hrSignatureDataUrl: nteHrSignatureUrl,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to issue Notice to Explain.");
        return;
      }
      toast.success(res.message ?? "Notice to Explain issued.");
      setNteHrSignatureUrl(null);
      router.refresh();
    });
  };

  const handleResolveCase = (e: React.FormEvent, caseId: string) => {
    e.preventDefault();
    if (!decisionHrSignatureUrl) {
      toast.error("Please sign the Notice of Decision before issuing.");
      return;
    }
    startTransition(async () => {
      const res = await resolveIncidentReportAction({
        caseId,
        outcome: decisionOutcome,
        sanctionType:
          decisionOutcome === "dismissed" ? "none" : decisionSanction,
        suspensionDays:
          decisionOutcome === "resolved" && decisionSanction === "suspension"
            ? Number(suspensionDays) || null
            : null,
        suspensionStartDate:
          decisionOutcome === "resolved" &&
          decisionSanction === "suspension" &&
          suspensionStartDate
            ? suspensionStartDate
            : null,
        suspensionEndDate:
          decisionOutcome === "resolved" &&
          decisionSanction === "suspension" &&
          suspensionEndDate
            ? suspensionEndDate
            : null,
        resolutionNotes: resolutionNotes.trim(),
        hrSignatureDataUrl: decisionHrSignatureUrl,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to issue final decision.");
        return;
      }
      toast.success(res.message ?? "Final Notice of Decision issued.");
      setResolutionNotes("");
      setDecisionHrSignatureUrl(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5B4FE9]">
            PH Labor Code Twin-Notice Due Process
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Incident Reports & Notices to Explain
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review supervisor incident logs, issue 5-calendar-day Notices to
            Explain (NTE), and render formal Notices of Decision.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsLogModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d2b68]"
        >
          <Plus className="h-4 w-4" />
          Log Incident Report
        </button>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[#1E1B4B] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-white/20 text-white" : "bg-white text-slate-700"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search case #, employee..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#5B4FE9] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Cases Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Gavel className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              No incident reports found
            </h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Adjust your filter or click &ldquo;Log Incident Report&rdquo; to
              start a new disciplinary case.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Case #</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Offense & Incident Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">5-Day NTE Window</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((c) => {
                  const statusMeta = INCIDENT_STATUS_META[c.status];
                  const countdown =
                    c.status === "nte_issued" && c.nteDeadlineAt
                      ? getNteCountdown(c.nteDeadlineAt)
                      : null;

                  return (
                    <tr
                      key={c.id}
                      className="transition hover:bg-slate-50/80"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-semibold text-[#1E1B4B]">
                        {c.caseNumber}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {c.employeeName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.employeeJobTitle} · {c.employeeDepartment}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800">
                          {c.offenseCategory}
                        </div>
                        <div className="text-xs text-slate-500">
                          Incident: {formatManilaDate(c.incidentDate)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                        {c.sanctionType &&
                          (c.status === "resolved" || c.status === "dismissed") && (
                            <div className="mt-1 text-[11px] font-medium text-slate-500">
                              {SANCTION_META[c.sanctionType]?.label}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {c.status === "draft" && (
                          <span className="text-slate-400">
                            Pending HR NTE issuance
                          </span>
                        )}
                        {countdown && (
                          <div
                            className={`inline-flex items-center gap-1.5 font-semibold ${
                              countdown.isOverdue
                                ? "text-rose-600"
                                : "text-amber-700"
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span>{countdown.label}</span>
                          </div>
                        )}
                        {c.status === "explanation_submitted" && (
                          <span className="font-medium text-indigo-700">
                            Response received{" "}
                            {formatManilaDate(c.explanationSubmittedAt)}
                          </span>
                        )}
                        {(c.status === "resolved" || c.status === "dismissed") && (
                          <span className="text-slate-500">
                            Closed {formatManilaDate(c.resolvedAt)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCaseId(c.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#5B4FE9] hover:text-[#1E1B4B]"
                        >
                          Open Case
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Incident Report Modal */}
      {mounted &&
        isLogModalOpen &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsLogModalOpen(false);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          >
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Log Incident Report (Draft)
                </h2>
                <p className="text-xs text-slate-500">
                  Saved as draft first. The employee will not see this until HR
                  officially issues a Notice to Explain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIr} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Employee
                </label>
                <select
                  value={newEmployeeId}
                  onChange={(e) => setNewEmployeeId(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#5B4FE9] focus:outline-none"
                >
                  <option value="">Select employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} — {emp.jobTitle} ({emp.departmentName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Incident Date
                  </label>
                  <input
                    type="date"
                    value={newIncidentDate}
                    onChange={(e) => setNewIncidentDate(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#5B4FE9] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Offense Category
                  </label>
                  <select
                    value={newOffenseCategory}
                    onChange={(e) => setNewOffenseCategory(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#5B4FE9] focus:outline-none"
                  >
                    {OFFENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Company Policy / Rule Violated (Optional)
                </label>
                <input
                  type="text"
                  value={newPolicyViolated}
                  onChange={(e) => setNewPolicyViolated(e.target.value)}
                  placeholder="e.g., Employee Handbook Sec. 4.2 - Punctuality"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#5B4FE9] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Statement of Facts & Description
                </label>
                <textarea
                  rows={4}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  required
                  minLength={10}
                  placeholder="Describe the specific facts, dates, times, and witnesses..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#5B4FE9] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Supporting Evidence (Optional, max 10 MB each)
                </label>
                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    setNewEvidenceFiles(Array.from(e.target.files ?? []))
                  }
                  className="mt-1.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-[#1E1B4B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d2b68] disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Draft IR"}
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}

      {/* Case Detail Modal */}
      {mounted &&
        selectedCase &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedCaseId(null);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          >
            <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-6 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#1E1B4B]">
                      {selectedCase.caseNumber}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        INCIDENT_STATUS_META[selectedCase.status].badgeClass
                      }`}
                    >
                      {INCIDENT_STATUS_META[selectedCase.status].label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedCase.employeeName}{" "}
                    <span className="font-normal text-slate-500">
                      · {selectedCase.employeeJobTitle} ({selectedCase.employeeDepartment})
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCaseId(null)}
                  aria-label="Close case details"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Compact Vertical Flow */}
              <div className="space-y-5 p-6">
                {/* Section 1: Incident Details & First Notice (NTE) */}
                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E1B4B]">
                    1. Incident Details &amp; First Notice (NTE)
                  </h3>

                  <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="font-medium text-slate-500">
                        Incident Date
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {formatManilaDate(selectedCase.incidentDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Reported By
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {selectedCase.reportedByName}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">
                        Offense &amp; Policy
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {selectedCase.offenseCategory}
                        {selectedCase.policyViolated
                          ? ` — ${selectedCase.policyViolated}`
                          : ""}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      Statement of Facts
                    </p>
                    <div className="mt-1.5 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-sm leading-relaxed text-slate-800">
                      {selectedCase.description}
                    </div>
                  </div>

                  {selectedCase.evidencePaths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Supporting Evidence ({selectedCase.evidencePaths.length})
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {selectedCase.evidencePaths.map((path, idx) =>
                          path.toLowerCase().split("?")[0].endsWith(".pdf") ? (
                            <DisciplinaryPdfViewer
                              key={path}
                              caseId={selectedCase.id}
                              filePath={path}
                              title={`Evidence #${idx + 1} (${selectedCase.caseNumber})`}
                              previewLabel={`Evidence #${idx + 1} (PDF)`}
                              variant="subtle"
                            />
                          ) : (
                            <button
                              key={path}
                              type="button"
                              onClick={() =>
                                handleOpenDocument(selectedCase.id, path)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#5B4FE9] hover:text-[#1E1B4B]"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              Evidence #{idx + 1}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {canIssueNte(selectedCase.status) ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                        <div className="text-xs text-amber-900">
                          <p className="font-bold">
                            Ready to Issue First Notice (NTE)
                          </p>
                          <p className="mt-1">
                            Issuing the NTE today grants the statutory{" "}
                            <strong>5-calendar-day</strong> response window,
                            ending on{" "}
                            <strong>
                              {formatManilaDateTime(previewDeadline)}
                            </strong>
                            .
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-amber-200/80 bg-white p-3">
                        <SignaturePad
                          defaultName={currentHrName}
                          label="HR Signatory Signature"
                          compact
                          disabled={isPending}
                          onChange={setNteHrSignatureUrl}
                        />
                      </div>

                      <button
                        type="button"
                        disabled={isPending || !nteHrSignatureUrl}
                        onClick={() => handleIssueNte(selectedCase.id)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2d2b68] disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        {isPending
                          ? "Generating NTE PDF..."
                          : "Issue NTE (5-Day Window)"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-slate-600">
                            <strong className="text-slate-900">NTE Issued:</strong>{" "}
                            {formatManilaDateTime(selectedCase.nteIssuedAt)}
                          </span>
                          <span className="text-slate-600">
                            <strong className="text-slate-900">5-Day Deadline:</strong>{" "}
                            {formatManilaDateTime(selectedCase.nteDeadlineAt)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {selectedCase.status === "nte_issued" &&
                            selectedCase.nteDeadlineAt &&
                            (() => {
                              const cd = getNteCountdown(selectedCase.nteDeadlineAt);
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                    cd.isOverdue
                                      ? "border-rose-200 bg-rose-50 text-rose-700"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  <Clock className="h-3 w-3" />
                                  {cd.label}
                                </span>
                              );
                            })()}
                          {selectedCase.nteHrSignedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                              <CheckCircle2 className="h-3 w-3" />
                              HR Signed
                              {selectedCase.nteHrSignatureName
                                ? ` · ${selectedCase.nteHrSignatureName}`
                                : ""}
                            </span>
                          )}
                          {selectedCase.nteAcknowledgedAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Employee Acknowledged (
                              {formatManilaDateTime(selectedCase.nteAcknowledgedAt)})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              <Clock className="h-3 w-3" />
                              Awaiting Employee Acknowledgment
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedCase.nteDocumentPath && (
                        <DisciplinaryPdfViewer
                          caseId={selectedCase.id}
                          filePath={selectedCase.nteDocumentPath}
                          versionKey={selectedCase.nteDocumentSha256}
                          title={`Notice to Explain (${selectedCase.caseNumber})`}
                          previewLabel="Preview NTE PDF"
                          downloadFileName={`NTE-${selectedCase.caseNumber}.pdf`}
                          variant="navy"
                          className="shrink-0"
                        />
                      )}
                    </div>
                  )}
                </section>

                {/* Section 2: Written Explanation & Final Decision (Stage-Aware) */}
                {selectedCase.status === "draft" ? (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    Employee written explanation and final decision controls unlock once HR issues the Notice to Explain.
                  </div>
                ) : (
                  <section className="space-y-4 border-t border-slate-100 pt-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E1B4B]">
                      2. Written Explanation &amp; Final Decision
                    </h3>

                    {selectedCase.status === "nte_issued" && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
                        <p className="font-bold">
                          Awaiting Employee Written Explanation
                        </p>
                        <p className="mt-0.5">
                          {getNteCountdown(selectedCase.nteDeadlineAt).label}.
                        </p>
                      </div>
                    )}

                    {selectedCase.employeeExplanation ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-500">
                            Employee Written Explanation
                          </span>
                          <span className="text-slate-500">
                            Submitted{" "}
                            {formatManilaDateTime(
                              selectedCase.explanationSubmittedAt
                            )}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 text-sm leading-relaxed text-slate-800">
                          {selectedCase.employeeExplanation}
                        </div>

                        {selectedCase.explanationAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {selectedCase.explanationAttachments.map(
                              (path, idx) =>
                                path.toLowerCase().split("?")[0].endsWith(".pdf") ? (
                                  <DisciplinaryPdfViewer
                                    key={path}
                                    caseId={selectedCase.id}
                                    filePath={path}
                                    title={`Response Attachment #${idx + 1} (${selectedCase.caseNumber})`}
                                    previewLabel={`Attachment #${idx + 1} (PDF)`}
                                    variant="subtle"
                                  />
                                ) : (
                                  <button
                                    key={path}
                                    type="button"
                                    onClick={() =>
                                      handleOpenDocument(selectedCase.id, path)
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#5B4FE9]"
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                    Response Attachment #{idx + 1}
                                  </button>
                                )
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      (selectedCase.status === "resolved" ||
                        selectedCase.status === "dismissed") && (
                        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                          No written explanation was submitted within the 5-calendar-day NTE period.
                        </p>
                      )
                    )}

                    {/* Issue Final Decision Form */}
                    {(() => {
                      const check = canResolveCase(
                        selectedCase.status,
                        selectedCase.nteDeadlineAt
                      );
                      if (!check.allowed) return null;

                      return (
                        <form
                          onSubmit={(e) => handleResolveCase(e, selectedCase.id)}
                          className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                        >
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-[#1E1B4B]" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                              Issue Final Decision (Second Notice)
                            </h4>
                          </div>

                          {check.isLapsedWithoutResponse && (
                            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                              The 5-calendar-day NTE period has lapsed without a
                              written explanation. You may now proceed with the
                              Notice of Decision based on evidence on record.
                            </p>
                          )}

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700">
                                Case Outcome
                              </label>
                              <select
                                value={decisionOutcome}
                                onChange={(e) => {
                                  const val = e.target.value as
                                    | "resolved"
                                    | "dismissed";
                                  setDecisionOutcome(val);
                                  if (val === "dismissed") {
                                    setDecisionSanction("none");
                                  }
                                }}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              >
                                <option value="resolved">
                                  Resolved (With Findings)
                                </option>
                                <option value="dismissed">
                                  Dismissed / Exonerated
                                </option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700">
                                Sanction Type
                              </label>
                              <select
                                value={
                                  decisionOutcome === "dismissed"
                                    ? "none"
                                    : decisionSanction
                                }
                                disabled={decisionOutcome === "dismissed"}
                                onChange={(e) =>
                                  setDecisionSanction(
                                    e.target.value as DisciplinarySanction
                                  )
                                }
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                              >
                                {DISCIPLINARY_SANCTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {SANCTION_META[s].label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {decisionOutcome === "resolved" &&
                            decisionSanction === "suspension" && (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700">
                                    Days (1-30)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={30}
                                    required
                                    value={suspensionDays}
                                    onChange={(e) =>
                                      setSuspensionDays(e.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700">
                                    Start Date
                                  </label>
                                  <input
                                    type="date"
                                    value={suspensionStartDate}
                                    onChange={(e) =>
                                      setSuspensionStartDate(e.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700">
                                    End Date
                                  </label>
                                  <input
                                    type="date"
                                    value={suspensionEndDate}
                                    onChange={(e) =>
                                      setSuspensionEndDate(e.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>
                            )}

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Findings &amp; Resolution Notes
                            </label>
                            <textarea
                              rows={3}
                              required
                              minLength={10}
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              placeholder="Summarize HR's evaluation of the evidence, the employee's explanation, and the basis for the final decision..."
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <SignaturePad
                              defaultName={currentHrName}
                              label="HR Signatory Signature"
                              compact
                              disabled={isPending}
                              onChange={setDecisionHrSignatureUrl}
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={isPending || !decisionHrSignatureUrl}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E1B4B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2d2b68] disabled:opacity-50"
                          >
                            <Gavel className="h-4 w-4" />
                            {isPending
                              ? "Generating Notice of Decision..."
                              : "Issue Final Decision"}
                          </button>
                        </form>
                      );
                    })()}

                    {/* Resolved / Dismissed Summary */}
                    {(selectedCase.status === "resolved" ||
                      selectedCase.status === "dismissed") && (
                      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" />
                            Final Decision Rendered
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatManilaDateTime(selectedCase.resolvedAt)}
                          </span>
                        </div>

                        {selectedCase.sanctionType && (
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                SANCTION_META[selectedCase.sanctionType]
                                  .badgeClass
                              }`}
                            >
                              {SANCTION_META[selectedCase.sanctionType].label}
                              {selectedCase.sanctionType === "suspension" &&
                              selectedCase.suspensionDays
                                ? ` (${selectedCase.suspensionDays} days)`
                                : ""}
                            </span>
                          </div>
                        )}

                        {selectedCase.resolutionNotes && (
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {selectedCase.resolutionNotes}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5">
                          {selectedCase.decisionHrSignedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                              <CheckCircle2 className="h-3 w-3" />
                              HR Signed
                              {selectedCase.decisionHrSignatureName
                                ? ` · ${selectedCase.decisionHrSignatureName}`
                                : ""}
                            </span>
                          )}
                          {selectedCase.decisionAcknowledgedAt ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Employee Acknowledged (
                              {formatManilaDateTime(
                                selectedCase.decisionAcknowledgedAt
                              )}
                              )
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <Clock className="h-3 w-3" />
                              Awaiting Employee Acknowledgment
                            </span>
                          )}
                        </div>

                        {selectedCase.decisionDocumentPath && (
                          <DisciplinaryPdfViewer
                            caseId={selectedCase.id}
                            filePath={selectedCase.decisionDocumentPath}
                            versionKey={selectedCase.decisionDocumentSha256}
                            title={`Notice of Decision (${selectedCase.caseNumber})`}
                            previewLabel="Preview Decision PDF"
                            downloadFileName={`Decision-${selectedCase.caseNumber}.pdf`}
                            variant="emerald"
                          />
                        )}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
