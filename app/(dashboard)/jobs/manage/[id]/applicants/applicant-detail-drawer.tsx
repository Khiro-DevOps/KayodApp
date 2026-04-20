"use client";

import { useState } from "react";
import type { Application } from "@/lib/types";
import InterviewSchedulingForm from "./interview-scheduling-form";

interface ApplicantDetailDrawerProps {
  application: Application;
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ApplicantDetailDrawer({
  application,
  jobId,
  isOpen,
  onClose,
}: ApplicantDetailDrawerProps) {
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const candidate = application?.profiles as any;
  const resume = application?.resumes as any;

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {candidate?.first_name} {candidate?.last_name}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{candidate?.email}</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Contact Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Contact Information</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-text-secondary mb-1">Email</p>
                <p className="text-text-primary">{candidate?.email}</p>
              </div>
              {candidate?.phone && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">Phone</p>
                  <p className="text-text-primary">{candidate.phone}</p>
                </div>
              )}
              {candidate?.city && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">Location</p>
                  <p className="text-text-primary">
                    {candidate.city}, {candidate.country}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Match Score */}
          {application?.match_score !== null && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Match Score</h3>
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${
                  application.match_score >= 70
                    ? "text-green-600"
                    : application.match_score >= 40
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}>
                  {application.match_score}%
                </div>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-full rounded-full ${
                      application.match_score >= 70
                        ? "bg-green-500"
                        : application.match_score >= 40
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${application.match_score}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Resume */}
          {resume && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Resume</h3>
              {resume.pdf_url && (
                <a
                  href={resume.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L9 9.414V13H5.5z" />
                  </svg>
                  <span className="text-sm font-medium">View {resume.title}</span>
                </a>
              )}
            </div>
          )}

          {/* Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Application Status</h3>
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
              application?.status === "hired"
                ? "bg-green-50 text-green-700"
                : application?.status === "rejected"
                ? "bg-red-50 text-red-700"
                : application?.status === "interview_scheduled"
                ? "bg-purple-50 text-purple-700"
                : "bg-blue-50 text-blue-700"
            }`}>
              {application?.status.replace(/_/g, " ")}
            </div>
          </div>

          {/* Cover Letter */}
          {application?.cover_letter && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Cover Letter</h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {application.cover_letter}
              </p>
            </div>
          )}
        </div>

        {/* Footer - Action Buttons */}
        <div className="border-t border-border p-6 space-y-3">
          {showScheduleForm ? (
            <InterviewSchedulingForm
              applicationId={application.id}
              jobId={jobId}
              onSuccess={() => {
                setShowScheduleForm(false);
                onClose();
              }}
              onCancel={() => setShowScheduleForm(false)}
            />
          ) : (
            <>
              <button
                onClick={() => setShowScheduleForm(true)}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-dark transition-colors"
              >
                Schedule Interview
              </button>
              <button
                onClick={onClose}
                className="w-full border border-border text-text-primary py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
