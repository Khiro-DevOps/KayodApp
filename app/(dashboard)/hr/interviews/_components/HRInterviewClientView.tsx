"use client";

import { useEffect, useState, useTransition } from "react";
import { updateApplicationStatus } from "@/app/(dashboard)/hr/applicants/hr-applications-actions";
import { updateInterviewNotes } from "@/lib/interviews";
import { ScheduleInterviewDrawer } from "./ScheduleInterviewDrawer";

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
  interview_notes?: string | null;
  scorecard?: Record<string, unknown> | null;
  candidateName: string;
  candidateEmail?: string | null;
  candidateSlug: string;
  jobTitle: string;
  interviewerName?: string | null;
  matchScore?: number | null;
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
  return new Date(dateValue).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function formatDate(dateValue?: string | null) {
  if (!dateValue) return "Needs scheduling";
  return new Date(dateValue).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });
}

function isLive(item: HRInterviewItem) {
  if (!item.scheduled_at || item.status === "cancelled" || item.status === "completed") return false;
  const start = new Date(item.scheduled_at).getTime();
  const end = start + item.duration_minutes * 60_000;
  const now = Date.now();
  return now >= start - 15 * 60_000 && now < end;
}

export function HRInterviewClientView({ schedules, applications, interviewers }: HRInterviewClientViewProps) {
  const [selectedId, setSelectedId] = useState(schedules[0]?.id ?? "");
  const [notes, setNotes] = useState(schedules[0]?.interview_notes ?? "");
  const [notesState, setNotesState] = useState<"saved" | "saving" | "error">("saved");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selected = schedules.find((item) => item.id === selectedId) ?? schedules[0] ?? null;

  useEffect(() => {
    setNotes(selected?.interview_notes ?? "");
    setNotesState("saved");
  }, [selected?.id, selected?.interview_notes]);

  useEffect(() => {
    if (!selected || notes === (selected.interview_notes ?? "")) return;
    setNotesState("saving");
    const timer = window.setTimeout(() => {
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

  const roomPath = selected ? `/interviews/${selected.id}/room` : "#";
  const displayRoomPath = selected ? `/interview/${selected.candidateSlug}/room` : "";
  const agenda = schedules.reduce<Record<string, HRInterviewItem[]>>((groups, item) => {
    const key = formatDate(item.scheduled_at);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});

  return (
    <div className="min-h-full bg-[#f8f6f2] px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Recruitment workspace</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Daily interview agenda</h1></div>
          <button type="button" onClick={() => setIsInviteOpen(true)} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800">+ Schedule interview</button>
        </header>

        <div className="grid min-h-[680px] gap-4 xl:grid-cols-[250px_minmax(0,1fr)_290px]">
          <aside className="rounded-xl border border-[#e8e1d7] bg-[#fffdf8] p-3">
            <div className="flex items-center justify-between px-2 pb-3"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Today</h2><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{schedules.length}</span></div>
            <div className="space-y-4">
              {Object.entries(agenda).map(([date, items]) => <section key={date}><h3 className="px-2 pb-2 text-[11px] font-semibold text-slate-400">{date}</h3><div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === item.id ? "border-violet-300 bg-violet-50" : "border-transparent hover:border-[#e8e1d7] hover:bg-white"}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-xs font-bold">{item.candidateName}</span>{isLive(item) && <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase text-rose-600"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Live</span>}</div><p className="mt-1 truncate text-[11px] text-slate-500">{item.jobTitle}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">{formatTime(item.scheduled_at)} - {item.scheduled_at ? formatTime(new Date(new Date(item.scheduled_at).getTime() + item.duration_minutes * 60_000).toISOString()) : ""}</p></button>)}</div></section>)}
              {schedules.length === 0 && <p className="px-2 py-8 text-center text-xs text-slate-500">No interviews scheduled yet.</p>}
            </div>
          </aside>

          <main className="rounded-xl border border-[#e8e1d7] bg-[#fffdf8] p-5 sm:p-7">
            {selected ? <div className="flex h-full flex-col">
              <div className="flex flex-col justify-between gap-3 border-b border-[#eee7de] pb-5 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${isLive(selected) ? "bg-rose-500" : "bg-amber-400"}`} /><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{isLive(selected) ? "Live session" : selected.status}</span></div><h2 className="mt-2 text-xl font-bold">{selected.jobTitle}</h2><p className="mt-1 text-sm text-slate-500">{selected.candidateName} · {formatDate(selected.scheduled_at)} · {formatTime(selected.scheduled_at)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{selected.duration_minutes} min</span></div>
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-2xl text-violet-700">▣</div><h3 className="text-lg font-bold">Ready to begin?</h3><p className="mt-2 max-w-sm text-sm text-slate-500">Launch the encrypted WebRTC room when the candidate is ready to join.</p><a href={roomPath} className="mt-6 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800">Launch WebRTC Jitsi Room</a><button type="button" onClick={() => void navigator.clipboard?.writeText(displayRoomPath)} className="mt-4 rounded-md border border-[#e8e1d7] bg-white px-3 py-2 font-mono text-[11px] text-slate-500 hover:bg-slate-50">{displayRoomPath} · Copy</button></div>
              <div className="border-t border-[#eee7de] pt-4"><div className="mb-2 flex items-center justify-between"><label htmlFor="interview-notes" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Interview notes</label><span className="text-[10px] text-slate-400">{notesState === "saving" ? "Auto-saving..." : notesState === "error" ? "Save failed" : "Auto-saved"}</span></div><textarea id="interview-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Type structured interview notes..." className="w-full resize-none rounded-lg border border-[#e8e1d7] bg-[#fffaf3] p-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" /></div>
              <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => updateStatus("hired")} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Hire</button><button type="button" disabled={isPending} onClick={() => updateStatus("rejected")} className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Reject</button></div>
            </div> : <div className="flex h-full items-center justify-center text-sm text-slate-500">Select an interview from the agenda.</div>}
          </main>

          <aside className="rounded-xl border border-[#e8e1d7] bg-[#fffdf8] p-5">{selected ? <div className="space-y-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Candidate summary</p><h2 className="mt-2 text-lg font-bold">{selected.candidateName}</h2><p className="text-xs text-slate-500">{selected.candidateEmail}</p></div><div><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Match score</span><span className="text-2xl font-bold text-emerald-700">{selected.matchScore ?? 0}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, Math.max(0, selected.matchScore ?? 0))}%` }} /></div><div className="mt-4 space-y-2 text-xs text-slate-500"><div className="flex justify-between"><span>Technical alignment</span><b className="text-slate-700">{selected.matchScore ?? 0}%</b></div><div className="flex justify-between"><span>Role fit</span><b className="text-slate-700">{selected.matchScore ? Math.max(0, selected.matchScore - 3) : 0}%</b></div></div></div><div className="rounded-lg bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Work setup</p><p className="mt-1 text-sm font-bold text-amber-950">{selected.workSetup || "Not specified"}</p></div><div className="rounded-lg border border-[#e8e1d7] bg-white p-3"><p className="text-xs font-bold">Resume</p><p className="mt-1 truncate text-[11px] text-slate-500">{selected.resumeUrl ? "Candidate resume PDF" : "No resume uploaded"}</p><button type="button" disabled={!selected.resumeUrl} onClick={() => setIsResumeOpen(true)} className="mt-3 w-full rounded-md border border-[#e8e1d7] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Open PDF Viewer</button></div></div> : <p className="text-sm text-slate-500">Candidate details appear here.</p>}</aside>
        </div>
      </div>
      <ScheduleInterviewDrawer isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} applications={applications} interviewers={interviewers} />
      {isResumeOpen && selected?.resumeUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white"><div className="flex items-center justify-between border-b p-4"><h2 className="font-bold">{selected.candidateName} resume</h2><button type="button" onClick={() => setIsResumeOpen(false)} className="text-sm font-bold text-slate-500">Close</button></div><iframe title="Candidate resume" src={selected.resumeUrl} className="min-h-0 flex-1" /></div></div>}
    </div>
  );
}
