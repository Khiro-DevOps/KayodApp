"use client";

import { useEffect, useMemo, useState } from "react";
import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";

interface JobRequiredDocumentsEditorProps {
  name: string;
  initialDocuments: RequiredDocumentDraft[];
}

function createBlankDocument(): RequiredDocumentDraft {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `doc-${Date.now()}`,
    name: "",
    is_required: true,
  };
}

export default function JobRequiredDocumentsEditor({ name, initialDocuments }: JobRequiredDocumentsEditorProps) {
  const [documents, setDocuments] = useState<RequiredDocumentDraft[]>(initialDocuments.length > 0 ? initialDocuments : [createBlankDocument()]);

  useEffect(() => {
    if (initialDocuments.length > 0) {
      setDocuments(initialDocuments);
    }
  }, [initialDocuments]);

  const payload = useMemo(() => JSON.stringify(documents), [documents]);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Required Documents</h3>
          <p className="text-xs text-text-secondary">Add the checklist that HR will require for this role.</p>
        </div>
        <button
          type="button"
          onClick={() => setDocuments((current) => [...current, createBlankDocument()])}
          className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-gray-50"
        >
          Add document
        </button>
      </div>

      <input type="hidden" name={name} value={payload} />

      <div className="space-y-2">
        {documents.map((document, index) => (
          <div key={document.id ?? `${document.name}-${index}`} className="grid gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <input
              type="text"
              value={document.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setDocuments((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, name: nextName } : item));
              }}
              placeholder="Document name"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="inline-flex items-center gap-2 text-xs font-medium text-text-secondary">
              <input
                type="checkbox"
                checked={document.is_required}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDocuments((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, is_required: checked } : item));
                }}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              Required
            </label>

            <button
              type="button"
              onClick={() => setDocuments((current) => current.filter((_, currentIndex) => currentIndex !== index))}
              className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
