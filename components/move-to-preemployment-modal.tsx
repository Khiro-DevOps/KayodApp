"use client";

import React, { useState } from "react";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";
import { moveApplicantToPreEmployment } from "@/lib/pre-employment-actions";

export default function MoveToPreEmploymentModal({
  isOpen,
  onClose,
  docs = [],
  applicationId,
  jobPostingId,
}: {
  isOpen: boolean;
  onClose: () => void;
  docs?: RequiredDocumentDraft[];
  applicationId?: string;
  jobPostingId?: string;
}) {
  const [deadline, setDeadline] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [localDocs, setLocalDocs] = useState<RequiredDocumentDraft[]>(docs);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded p-4 w-full max-w-2xl">
        <h3 className="text-lg font-semibold">Move to Pre-employment</h3>
        <p className="text-sm text-slate-600">Set deadline, instructions, and confirm checklist.</p>

        <form action={async (formData: FormData) => { await moveApplicantToPreEmployment(formData); }} className="mt-3 space-y-3">
          <input type="hidden" name="application_id" value={applicationId ?? ""} />
          <input type="hidden" name="job_posting_id" value={jobPostingId ?? ""} />
          <input type="hidden" name="documents_json" value={JSON.stringify(localDocs)} />

          <div>
            <label className="block text-sm">Submission deadline</label>
            <input
              id="doc_deadline"
              name="doc_deadline"
              type="datetime-local"
              className="border rounded px-2 py-1"
              value={deadline ?? ""}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm">Instruction (optional)</label>
            <textarea id="doc_submission_note" name="doc_submission_note" className="w-full border rounded p-2" rows={3} value={note ?? ""} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm">Checklist (editable)</label>
            <div className="mt-2 space-y-2">
              {localDocs.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="flex-1 border rounded px-2 py-1" value={d.name} onChange={(e) => setLocalDocs(localDocs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!d.is_required} onChange={(e) => setLocalDocs(localDocs.map((x, j) => (j === i ? { ...x, is_required: e.target.checked } : x)))} />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose} type="button">Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Move to Pre-employment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
