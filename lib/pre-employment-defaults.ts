import type { RequiredDocumentDraft } from "@/lib/pre-employment-actions";

export const DEFAULT_REQUIRED_DOCUMENTS: RequiredDocumentDraft[] = [
  { name: "NBI Clearance", is_required: true },
  { name: "BIR Form 2316", is_required: true },
  { name: "SSS ID", is_required: true },
  { name: "PhilHealth ID", is_required: true },
  { name: "Pag-IBIG ID", is_required: true },
  { name: "Birth Certificate", is_required: true },
  { name: "Transcript of Records", is_required: true },
];