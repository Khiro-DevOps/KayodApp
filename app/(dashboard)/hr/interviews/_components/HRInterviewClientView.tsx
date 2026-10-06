"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplicationStatus } from "@/app/(dashboard)/hr/applicants/hr-applications-actions";
import { updateInterviewNotes } from "@/lib/interviews";
import { completeInterview, getInterviewRequirements, getOfficeBranches, type InterviewCompletionOutcome, type OfficeBranchOption, type InterviewRequirementOption } from "../actions";
import { ScheduleInterviewDrawer } from "./ScheduleInterviewDrawer";
import { formatPht, getRoomAccess } from "@/lib/interview-room-access";
import { getPhtDateGroup } from "@/lib/interview-date";

interface ApplicationOption { id: string; candidateName: string; jobTitle: string; }
interface InterviewerOption { id: string; name: string; }
interface HRInterviewItem {
  id: string;
  application_id: string;
  applicant_id?: string | null;
  interviewer_id?: string | null;
  scheduled_at?: string | null;
  duration_minutes: number;
  status: string;
  room_name?: string | null;
  meeting_link?: string | null;
  meeting_type?: "online" | "in_person" | "hybrid";
  office_branch_id?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  interview_notes?: string | null;
  scorecard?: Record<string, unknown> | null;
  candidateName: string;
  candidateEmail?: string | null;
  candidateSlug: string;
  jobTitle: string;
  interviewerName?: string | null;
  matchScore?: number | null;
  technicalAlignment?: number | null;
  roleFit?: number | null;
  workSetup?: string | null;
  resumeUrl?: string | null;
}

interface HRInterviewClientViewProps {
  schedules: HRInterviewItem[];
  applications: ApplicationOption[];
  interviewers: InterviewerOption[];
}

function formatTime(dateValue?: string | null) {
  if (!dateValue) return "Time to be confirmed";
  return new Date(dateValue).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "Needs scheduling";
  return new Date(dateValue).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "short", day: "numeric" });
}

function isLive(item: HRInterviewItem) {
  if (!item.scheduled_at || item.status === "cancelled" || item.status === "completed") return false;
  const start = new Date(item.scheduled_at).getTime();
  const end = start + item.duration_minutes * 60_000;
  const now = Date.now();
  return now >= start - 15 * 60_000 && now < end;
}

export function HRInterviewClientView({ schedules, applications, interviewers }: HRInterviewClientViewProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(schedules[0]?.id ?? "");
  const [notes, setNotes] = useState(schedules[0]?.interview_notes ?? "");
  const [notesState, setNotesState] = useState<"saved" | "saving" | "error">("saved");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState<InterviewCompletionOutcome>("advance");
  const [completionNotes, setCompletionNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionBranchId, setCompletionBranchId] = useState("");
  const [branches, setBranches] = useState<OfficeBranchOption[]>([]);
  const [requirements, setRequirements] = useState<InterviewRequirementOption[]>([]);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [sendRequirements, setSendRequirements] = useState(false);
  const [requirementsDeadline, setRequirementsDeadline] = useState("");
  const [requirementsNote, setRequirementsNote] = useState("");
  const [completionWarning, setCompletionWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"upcoming" | "history">("upcoming");
  const [search, setSearch] = useState("");
  const isHistory = (item: HRInterviewItem) => {
    const access = getRoomAccess(item);
    return ["completed", "cancelled", "no_show"].includes(item.status) || access.state === "ended";
  };
  const visibleSchedules = schedules
    .filter((item) => (filter === "history" ? isHistory(item) : !isHistory(item)))
    .filter((item) => `${item.candidateName} ${item.jobTitle}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => filter === "history"
      ? new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime()
      : new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime());
  const selected = visibleSchedules.find((item) => item.id === selectedId) ?? visibleSchedules[0] ?? null;

  useEffect(() => {
    void getOfficeBranches().then((result) => { if (result.success) setBranches(result.data ?? []); });
  }, []);

  useEffect(() => {
    if (!isCompleteOpen || !selected) return;
    void getInterviewRequirements(selected.id).then((result) => {
      if (result.success) {
        setRequirements(result.data ?? []);
        setSelectedRequirementIds((result.data ?? []).filter((item) => item.is_required).map((item) => item.id));
      }
    });
  }, [isCompleteOpen, selected?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNotes(selected?.interview_notes ?? "");
      setNotesState("saved");
    });
    return () => window.clearTimeout(timer);
  }, [selected?.id, selected?.interview_notes]);

  useEffect(() => {
    if (!selected || notes === (selected.interview_notes ?? "")) return;
    const timer = window.setTimeout(() => {
      setNotesState("saving");
      startTransition(async () => {
        const result = await updateInterviewNotes(selected.id, notes);
        setNotesState(result.success ? "saved" : "error");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [notes, selected]);

  const updateStatus = (status: "hired" | "rejected") => {
    if (!selected) return;
    const formData = new FormData();
    formData.set("application_id", selected.application_id);
    formData.set("status", status);
    startTransition(async () => { await updateApplicationStatus(formData); });
  };

  const submitCompletion = () => {
    if (!selected) return;
    setCompletionError(null);
    setCompletionWarning(null);
    startTransition(async () => {
      const result = await completeInterview({
        interviewId: selected.id,
        outcome: completionOutcome,
        notes: completionNotes,
        rejectionReason,
        meetingType: selected.meeting_type ?? "online",
        officeBranchId: selected.meeting_type === "in_person" || selected.meeting_type === "hybrid" ? (completionBranchId || selected.office_branch_id || null) : null,
        sendRequirements,
        requirementIds: selectedRequirementIds,
        deadline: requirementsDeadline || null,
        note: requirementsNote,
      });
      if (!result.success) {
        setCompletionError(result.error ?? "Could not complete interview");
        return;
      }
      setCompletionWarning(result.warning ?? null);
      setIsCompleteOpen(false);
      setCompletionNotes("");
      setRejectionReason("");
      setCompletionBranchId("");
      router.refresh();
    });
  };

  const roomPath = selected ? `/hr/interviews/${selected.id}/room` : "#";
  const displayRoomPath = selected ? `/interview/${selected.candidateSlug}/room` : "";
  const agenda = visibleSchedules.reduce<Record<string, HRInterviewItem[]>>((groups, item) => {
    const key = getPhtDateGroup(item.scheduled_at);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});

  return (
    <div className="min-h-full w-full min-w-0 bg-surface-bg px-0 py-0 text-text-main">
      <div className="w-full min-w-0 space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Recruitment workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Daily interview agenda</h1></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card-bg p-1 text-xs font-semibold"><button type="button" onClick={() => setFilter("upcoming")} className={`rounded-md px-3 py-1.5 ${filter === "upcoming" ? "bg-primary text-white" : "text-text-muted"}`}>Upcoming</button><button type="button" onClick={() => setFilter("history")} className={`rounded-md px-3 py-1.5 ${filter === "history" ? "bg-primary text-white" : "text-text-muted"}`}>History</button></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidate or job" className="rounded-lg border border-border bg-card-bg px-3 py-2 text-xs outline-none" />
            <button type="button" onClick={() => setIsInviteOpen(true)} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90">+ Schedule interview</button>
          </div>
        </header>

        <div className="grid min-h-[680px] min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <aside className="min-w-0 overflow-hidden rounded-xl border border-border bg-card-bg p-3">
            <div className="flex items-center justify-between px-2 pb-3"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">{filter === "history" ? "History" : "Upcoming"}</h2><span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-bold text-primary-dark">{visibleSchedules.length}</span></div>
            <div className="space-y-4">
              {Object.entries(agenda).map(([date, items]) => <section key={date}><h3 className="px-2 pb-2 text-[11px] font-semibold text-slate-400">{date}</h3><div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === item.id ? "border-violet-300 bg-violet-50" : "border-transparent hover:border-border hover:bg-white"}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-xs font-bold">{item.candidateName}</span>{isLive(item) && <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Live</span>}</div><p className="mt-1 truncate text-[11px] text-slate-500">{item.jobTitle}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">{formatTime(item.scheduled_at)} - {item.scheduled_at ? formatTime(new Date(new Date(item.scheduled_at).getTime() + item.duration_minutes * 60_000).toISOString()) : ""}</p></button>)}</div></section>)}
              {visibleSchedules.length === 0 && <p className="px-2 py-8 text-center text-xs text-text-muted">No interviews in this view.</p>}
            </div>
          </aside>

          <main className="min-w-0 rounded-xl border border-border bg-card-bg p-5 sm:p-7">
            {selected ? <div className="flex h-full flex-col">
              <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${isLive(selected) ? "bg-rose-500" : "bg-amber-400"}`} /><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{isLive(selected) ? "Live session" : selected.status}</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{selected.meeting_type === "in_person" ? `In-Person · ${selected.branchName ?? "Office"}` : selected.meeting_type === "hybrid" ? `Hybrid · ${selected.branchName ?? "Office"}` : "Online"}</span></div><h2 className="mt-2 text-xl font-bold">{selected.jobTitle}</h2><p className="mt-1 text-sm text-slate-500">{selected.candidateName} · {formatDate(selected.scheduled_at)} · {formatTime(selected.scheduled_at)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{selected.duration_minutes} min</span></div>
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">{(() => { const access = getRoomAccess(selected); if (access.state === "open" && selected.meeting_type !== "in_person") return <><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-2xl text-primary">▣</div><h3 className="text-lg font-bold">Ready to begin?</h3><p className="mt-2 text-sm text-text-muted">Launch the WebRTC room when the candidate is ready to join.</p><a href={roomPath} className="mt-6 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary/90">Launch WebRTC Jitsi Room</a></>; if (access.state === "too_early") return <><h3 className="text-lg font-bold">Room not open yet</h3><p className="mt-2 text-sm text-text-muted">Opens at {formatPht(access.opensAt)} PHT.</p><button type="button" disabled className="mt-6 rounded-lg bg-surface-container-low px-5 py-3 text-sm font-bold text-text-muted">Launch unavailable</button></>; return <><h3 className="text-lg font-bold">{selected.status === "completed" ? "Interview completed" : "Interview time has ended"}</h3><p className="mt-2 text-sm text-text-muted">{selected.status === "completed" ? "This interview is closed." : "Awaiting HR review."}</p></>; })()}<button type="button" onClick={() => void navigator.clipboard?.writeText(displayRoomPath)} className="mt-4 rounded-md border border-border bg-card-bg px-3 py-2 font-mono text-[11px] text-text-muted hover:bg-surface-bg">{displayRoomPath} · Copy</button></div>
              <div className="border-t border-border pt-4"><div className="mb-2 flex items-center justify-between"><label htmlFor="interview-notes" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Interview notes</label><span className="text-[10px] text-slate-400">{notesState === "saving" ? "Auto-saving..." : notesState === "error" ? "Save failed" : "Auto-saved"}</span></div><textarea id="interview-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Type structured interview notes..." className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>
              <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => updateStatus("hired")} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Hire</button><button type="button" disabled={isPending} onClick={() => updateStatus("rejected")} className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Reject</button>{selected.status !== "completed" && <button type="button" onClick={() => setIsCompleteOpen(true)} className="rounded-lg border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100">Complete Interview</button>}</div>
            </div> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Select an interview from the agenda.</div>}
          </main>

          <aside className="rounded-xl border border-border bg-card-bg p-5">{selected ? <div className="space-y-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Candidate summary</p><h2 className="mt-2 text-lg font-bold">{selected.candidateName}</h2><p className="text-xs text-slate-500">{selected.candidateEmail}</p></div><div><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Match score</span><span className="text-2xl font-bold text-emerald-700">{selected.matchScore == null ? "Not scored yet" : `${selected.matchScore}%`}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, Math.max(0, selected.matchScore ?? 0))}%` }} /></div><div className="mt-4 space-y-2 text-xs text-slate-500"><div className="flex justify-between"><span>Technical alignment</span><b className="text-slate-700">{selected.technicalAlignment == null ? "Not scored yet" : `${selected.technicalAlignment}%`}</b></div><div className="flex justify-between"><span>Role fit</span><b className="text-slate-700">{selected.roleFit == null ? "Not scored yet" : `${selected.roleFit}%`}</b></div></div></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Work setup</p><p className="mt-1 text-sm font-bold text-amber-950">{selected.workSetup || "Not specified"}</p></div><div className="rounded-lg border border-border bg-white p-3"><p className="text-xs font-bold">Resume</p><p className="mt-1 truncate text-[11px] text-slate-500">{selected.resumeUrl ? "Candidate resume PDF" : "No resume uploaded"}</p><button type="button" disabled={!selected.resumeUrl} onClick={() => setIsResumeOpen(true)} className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Open PDF Viewer</button></div></div> : <p className="text-sm text-slate-500">Candidate details appear here.</p>}</aside>
        </div>
      </div>
      <ScheduleInterviewDrawer isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} applications={applications} interviewers={interviewers} />
      {isResumeOpen && selected?.resumeUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white"><div className="flex items-center justify-between border-b p-4"><h2 className="font-bold">{selected.candidateName} resume</h2><button type="button" onClick={() => setIsResumeOpen(false)} className="text-sm font-bold text-slate-500">Close</button></div><iframe title="Candidate resume" src={selected.resumeUrl} className="min-h-0 flex-1" /></div></div>}
      {completionWarning && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{completionWarning}</p>}
      {isCompleteOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-lg rounded-2xl border border-border bg-card-bg p-6 shadow-xl"><h2 className="text-lg font-bold">Complete Interview</h2>      <div className="mt-4 space-y-3"><p className="text-sm text-slate-600">Meeting type: <b>{selected.meeting_type === "in_person" ? "In-Person" : "Online"}</b></p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendRequirements} onChange={(event) => setSendRequirements(event.target.checked)} />Send requirements online to the applicant</label>{sendRequirements && <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-xs font-semibold">Requested documents</p>{requirements.map((requirement) => <label key={requirement.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedRequirementIds.includes(requirement.id)} onChange={(event) => setSelectedRequirementIds((current) => event.target.checked ? [...current, requirement.id] : current.filter((id) => id !== requirement.id))} />{requirement.name}{requirement.is_required ? " (required)" : ""}</label>)}<input type="date" value={requirementsDeadline} onChange={(event) => setRequirementsDeadline(event.target.value)} className="w-full rounded-lg border border-border p-2 text-sm" /><textarea value={requirementsNote} onChange={(event) => setRequirementsNote(event.target.value)} placeholder="Note for applicant (optional)" className="min-h-16 w-full rounded-lg border border-border p-2 text-sm" /></div>}{selected.meeting_type === "in_person" && <select value={completionBranchId || selected.office_branch_id || ""} onChange={(event) => setCompletionBranchId(event.target.value)} className="w-full rounded-lg border border-border bg-surface p-3 text-sm"><option value="">Select office branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} — {branch.address}</option>)}</select>}{([["advance", "Advance to Offer & Contract"], ["reject", "Reject"], ["hold", "Keep in Interview stage"]] as const).map(([value, label]) => <label key={value} className="flex items-center gap-3 text-sm"><input type="radio" name="completion-outcome" checked={completionOutcome === value} onChange={() => setCompletionOutcome(value)} />{label}</label>)}<textarea value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} placeholder="Notes (optional)" className="min-h-24 w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-violet-400" />{completionOutcome === "reject" && <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Rejection reason (required)" className="min-h-20 w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-violet-400" />}{completionError && <p className="text-sm text-rose-600">{completionError}</p>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsCompleteOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button type="button" disabled={isPending} onClick={submitCompletion} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Complete Interview"}</button></div></div></div>}
    </div>
  );
}
