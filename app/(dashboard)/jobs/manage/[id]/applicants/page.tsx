import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Application, Interview } from "@/lib/types";
import Link from "next/link";
import { updateApplicationStatus } from "@/app/(dashboard)/applications/hr-applications-actions";

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify employer owns this job
  const { data: employer } = await supabase
    .from("employers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!employer) redirect("/dashboard");

  const { data: job } = await supabase
    .from("job_listings")
    .select("id, title")
    .eq("id", id)
    .eq("employer_id", employer.id)
    .single();

  if (!job) notFound();

  // Fetch applicants
  const { data: applications } = await supabase
    .from("applications")
    .select("*, profiles(full_name, email), resumes(file_name, file_url)")
    .eq("job_listing_id", id)
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<Application[]>();

  // Fetch interviews for all applications on this job
  const applicationIds = applications?.map((a) => a.id) || [];
  const { data: interviews } = applicationIds.length
    ? await supabase
        .from("interviews")
        .select("*")
        .in("application_id", applicationIds)
        .returns<Interview[]>()
    : { data: [] as Interview[] };

  const interviewMap = new Map(
    (interviews || []).map((i) => [i.application_id, i])
  );

  const statusConfig: Record<string, { label: string; classes: string }> = {
    applied: { label: "Applied", classes: "bg-blue-50 text-info" },
    shortlisted: { label: "Shortlisted", classes: "bg-yellow-50 text-warning" },
    interview: { label: "Interview", classes: "bg-purple-50 text-purple-600" },
    hired: { label: "Hired", classes: "bg-green-50 text-success" },
  };

  const statusFlow = ["applied", "shortlisted", "interview", "hired"];

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/manage/${id}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary truncate">
              Applicants
            </h1>
            <p className="text-xs text-text-secondary truncate">{job.title}</p>
          </div>
        </div>

        {/* Applicants Count */}
        <p className="text-sm text-text-secondary">
          {applications?.length || 0} applicant{applications?.length !== 1 ? "s" : ""}
        </p>

        {/* Applicant List */}
        {!applications || applications.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-6 text-center">
            <p className="text-sm text-text-secondary">No applicants yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const applicant = app.profiles as unknown as {
                full_name: string;
                email: string;
              } | undefined;
              const resume = app.resumes as unknown as {
                file_name: string;
                file_url: string;
              } | null;
              const config = statusConfig[app.status] || statusConfig.applied;
              const interview = interviewMap.get(app.id);

              const currentIdx = statusFlow.indexOf(app.status);
              const nextStatus = currentIdx < statusFlow.length - 1 ? statusFlow[currentIdx + 1] : null;

              return (
                <div
                  key={app.id}
                  className="rounded-2xl bg-surface border border-border p-4 space-y-3"
                >
                  {/* Applicant Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                          {applicant?.full_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {applicant?.full_name || "Unknown"}
                          </p>
                          <p className="text-xs text-text-secondary truncate">
                            {applicant?.email || ""}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {app.match_score !== null && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          app.match_score >= 70 ? 'bg-green-50 text-success' :
                          app.match_score >= 40 ? 'bg-yellow-50 text-warning' :
                          'bg-gray-100 text-text-secondary'
                        }`}>
                          {app.match_score}% match
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
                      >
                        {config.label}
                      </span>
                    </div>
                  </div>

                  {/* Resume Link */}
                  {resume && (
                    <a
                      href={resume.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-background p-2 text-xs text-primary hover:bg-primary/5 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
                      </svg>
                      <span className="truncate">{resume.file_name}</span>
                    </a>
                  )}

                  {/* Interview Details */}
                  {(app.status === "interview" || app.status === "hired") && interview && (
                    <div className="rounded-xl bg-purple-50 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-purple-700">
                          Interview: {new Date(interview.scheduled_at).toLocaleString()}
                        </p>
                        {app.status === "interview" && (
                          <Link
                            href={`/jobs/manage/${id}/applicants/${app.id}/interview`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                      {interview.notes && (
                        <p className="text-xs text-purple-600">{interview.notes}</p>
                      )}
                    </div>
                  )}

                  {/* Schedule Interview Link */}
                  {app.status === "interview" && !interview && (
                    <Link
                      href={`/jobs/manage/${id}/applicants/${app.id}/interview`}
                      className="flex items-center gap-2 rounded-xl bg-purple-50 p-2 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                      </svg>
                      Schedule Interview
                    </Link>
                  )}

                  {/* Applied Date + Actions */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-secondary">
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </p>

                    {nextStatus && (
                      <form action={updateApplicationStatus}>
                        <input type="hidden" name="application_id" value={app.id} />
                        <input type="hidden" name="status" value={nextStatus} />
                        <input type="hidden" name="job_id" value={id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
                        >
                          Move to {statusConfig[nextStatus]?.label || nextStatus}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
