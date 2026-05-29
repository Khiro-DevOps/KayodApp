import React from "react";
import Link from "next/link";

export default function Page({ params }: { params: { id: string } }) {
  const { id } = params;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Applicant Documents</h1>
      <p className="text-sm text-slate-600 mt-1">Review and verify pre-employment documents for applicant {id}.</p>

      <div className="mt-6">
        <p className="mb-2">This page scaffold implements the HR review UI for Sprint 1.5.</p>
        <ul className="list-disc pl-6">
          <li>Deadline banner</li>
          <li>Document checklist (approve/request resubmission/mark in-person)</li>
          <li>Confirm Hire button (enabled when all required docs verified)</li>
        </ul>

        <div className="mt-4">
          <Link href={`/dashboard/applicants/${id}`} className="btn">Back to applicant</Link>
        </div>
      </div>
    </div>
  );
}
