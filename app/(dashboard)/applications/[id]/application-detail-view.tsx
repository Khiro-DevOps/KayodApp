"use client";

import Link from "next/link";
import { Application, Interview } from "@/lib/types";
import { format } from "date-fns";

interface ApplicationDetailViewProps {
  application: Application;
  interviews: any[];
  userRole: string;
  isCurrentUser: boolean;
  signedResumeUrl: string | null;
  jobOffer?: any | null;
}

export default function ApplicationDetailView({
  application,
  interviews,
  userRole,
  isCurrentUser,
  signedResumeUrl,
  jobOffer,
}: ApplicationDetailViewProps) {
  const job = application.job_postings as any;
  const resume = application.resumes as any;
  const status = application.status;

  const getStatusStyle = (s: string) => {
    switch (s) {
      case "hired": return "bg-green-100 text-green-700 border-green-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
      case "interview_scheduled": return "bg-purple-100 text-purple-700 border-purple-200";
      default: return "bg-blue-100 text-blue-700 border-blue-200";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{job?.title || "Position Title"}</h1>
          <p className="text-text-secondary">
            {job?.location || "Location"} • {job?.employment_type?.replace(/_/g, " ") || "Full-time"}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full border text-sm font-semibold text-center w-fit ${getStatusStyle(status)}`}>
          {status?.replace(/_/g, " ").toUpperCase()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Interview Section */}
          {interviews.length > 0 && (
            <section className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-purple-900 mb-4">Interview Details</h2>
              {interviews.map((interview) => (
                <div key={interview.id} className="space-y-3 pb-4 border-b border-purple-100 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="bg-purple-200 text-purple-800 text-xs font-bold px-2 py-1 rounded">
                      {interview.interview_type?.toUpperCase() || "INTERVIEW"}
                    </span>
                    <p className="font-medium text-purple-900">
                      {format(new Date(interview.scheduled_at), "PPPP 'at' p")}
                    </p>
                  </div>
                  {interview.video_room_url ? (
                    <Link
                      href="/interviews"
                      className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 transition-colors font-semibold"
                    >
                      <span>🎥</span>
                      <span>Join Meeting</span>
                    </Link>
                  ) : interview.interview_type === "online" ? (
                    <div className="text-sm text-purple-600 italic">
                      Meeting link will be available closer to the interview time.
                    </div>
                  ) : (
                    <p className="text-sm text-purple-700 font-medium">
                      📍 {interview.location_address || interview.location_notes || "Location details to be confirmed"}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="bg-surface border border-border rounded-2xl p-6">
            <h2 className="text-lg font-bold text-text-primary mb-4">Job Description</h2>
            <div className="text-text-secondary text-sm whitespace-pre-wrap leading-relaxed">
              {job?.description || "No description provided."}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Documents Section */}
          <section className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="text-sm font-bold text-text-primary mb-4">Your Documents</h3>
            {signedResumeUrl ? (
              <a
                href={signedResumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all text-sm font-medium border border-primary/20"
              >
                <span>📄 View {resume?.title || "My Resume"}</span>
              </a>
            ) : (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-xs text-red-600">Secure link could not be generated.</p>
              </div>
            )}
          </section>

          {/* Timeline Section */}
          <section className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="text-sm font-bold text-text-primary mb-4">Timeline</h3>
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">Applied</p>
                <p className="text-xs text-text-secondary">
                  {application.submitted_at
                    ? format(new Date(application.submitted_at), "MMM d, yyyy")
                    : "Date unknown"}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}