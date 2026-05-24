import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { computeMatchScore, calculateCompatibilityScore, calculateWeightedMatchScore } from "@/lib/match-score";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { application_id, resume_id, job_posting_id, candidate_id } = body as Record<string, string>;

  if (!application_id && !resume_id && !(job_posting_id && candidate_id)) {
    return NextResponse.json({ error: "Require application_id or resume_id or (job_posting_id & candidate_id)" }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    // Resolve target applications
    let { data: applications } = application_id
      ? await admin.from("applications").select("id, resume_id, job_posting_id").eq("id", application_id)
      : resume_id
      ? await admin.from("applications").select("id, resume_id, job_posting_id").eq("resume_id", resume_id)
      : await admin.from("applications").select("id, resume_id, job_posting_id").eq("job_posting_id", job_posting_id).eq("candidate_id", candidate_id);

    applications = applications ?? [];

    let updated = 0;

    for (const app of applications) {
      // Fetch resume row
      const { data: resume } = await admin.from("resumes").select("content_text, input_data").eq("id", app.resume_id).maybeSingle();

      if (!resume) continue;

      // Fetch job posting
      const { data: job } = await admin
        .from("job_postings")
        .select("title, description, requirements, required_skills, work_setup, city_id, province_id")
        .eq("id", app.job_posting_id)
        .maybeSingle();

      if (!job) continue;

      // Build resume text
      let resumeText = "";
      if (resume.content_text && String(resume.content_text).trim()) {
        resumeText = String(resume.content_text);
      } else if (resume.input_data) {
        const inputData = resume.input_data as Record<string, unknown>;
        const pieces: string[] = [];
        if (typeof inputData.summary === "string") pieces.push(inputData.summary);
        if (typeof inputData.experience === "string") pieces.push(inputData.experience);
        if (typeof inputData.education === "string") pieces.push(inputData.education);
        if (Array.isArray(inputData.skills)) pieces.push((inputData.skills as string[]).join(" "));
        resumeText = pieces.join(" ");
      }

      const semantic = computeMatchScore(resumeText, {
        title: job.title ?? "",
        description: job.description ?? "",
        requirements: job.requirements ?? null,
        required_skills: Array.isArray(job.required_skills) ? job.required_skills : [],
      });

      const compatibility = calculateCompatibilityScore(
        job.work_setup,
        job.city_id,
        job.province_id,
        null,
        null,
        null
      );

      const finalScore = calculateWeightedMatchScore(semantic, compatibility);

      await admin.from("applications").update({ match_score: finalScore, updated_at: new Date().toISOString() }).eq("id", app.id);
      updated++;
    }

    return NextResponse.json({ success: true, updated }, { status: 200 });
  } catch (err) {
    console.error("recompute-match-score error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
