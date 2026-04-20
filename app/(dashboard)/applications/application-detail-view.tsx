"use client";

import { useState } from "react";
import type { Application, Interview, UserRole } from "@/lib/types";
import ResumeViewer from "./resume-viewer";
import StatusTracker from "./status-tracker";
import EvaluationSidebar from "./evaluation-sidebar";
import InterviewTimeline from "./interview-timeline";

interface ApplicationDetailViewProps {
  application: Application;
  interviews: Interview[];
  userRole: UserRole;
  isCurrentUser: boolean;
}

export default function ApplicationDetailView({
  application,
  interviews,
  userRole,
  isCurrentUser,
}: ApplicationDetailViewProps) {
  const [applicationStatus, setApplicationStatus] = useState(application?.status);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isRecruiter = userRole === "hr_manager" || userRole === "admin";
  const candidate = application?.profiles as any;
  const resume = application?.resumes as any;
  const job = application?.job_postings as any;

  const handleStatusUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {candidate?.avatar_url && (
              <img
                src={candidate.avatar_url}
                alt={candidate.first_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                {candidate?.first_name} {candidate?.last_name}
              </h1>
              <p className="text-sm text-text-secondary">{job?.title}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-text-secondary mt-3">
            <div>
              <p className="text-xs font-medium uppercase text-text-secondary mb-0.5">Email</p>
              <p>{candidate?.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-text-secondary mb-0.5">Phone</p>
              <p>{candidate?.phone || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-text-secondary mb-0.5">Location</p>
              <p>{candidate?.city}, {candidate?.country}</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4">
          {application?.match_score !== null && (
            <div className="text-center">
              <div className={`text-3xl font-bold ${
                application.match_score >= 70 ? "text-green-600" :
                application.match_score >= 40 ? "text-yellow-600" :
                "text-red-600"
              }`}>
                {application.match_score}%
              </div>
              <p className="text-xs text-text-secondary mt-1">Match Score</p>
            </div>
          )}
          <div className="text-center">
            <div className="text-lg font-semibold text-text-primary">
              {new Date(application?.submitted_at).toLocaleDateString()}
            </div>
            <p className="text-xs text-text-secondary mt-1">Applied On</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Applicant View: Status Tracker */}
          {!isRecruiter && (
            <StatusTracker
              status={applicationStatus || application?.status}
              interviews={interviews}
            />
          )}

          {/* Resume Viewer */}
          {resume && (
            <ResumeViewer resume={resume} candidateName={`${candidate?.first_name} ${candidate?.last_name}`} />
          )}

          {/* Interview Timeline */}
          {interviews.length > 0 && (
            <InterviewTimeline interviews={interviews} isRecruiter={isRecruiter} />
          )}

          {/* Cover Letter */}
          {application?.cover_letter && (
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Cover Letter</h3>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {application.cover_letter}
              </p>
            </div>
          )}
        </div>

        {/* Recruiter View: Evaluation Sidebar */}
        {isRecruiter && (
          <EvaluationSidebar
            application={application}
            job={job}
            onStatusUpdate={handleStatusUpdate}
          />
        )}
      </div>
    </div>
  );
}
