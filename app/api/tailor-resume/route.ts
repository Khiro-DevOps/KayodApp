import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { tailorResume } from "@/lib/gemini";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify job seeker role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can tailor resumes" }, { status: 403 });
  }

  let body: { resume_id: string; job_listing_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resume_id, job_listing_id } = body;

  if (!resume_id || !job_listing_id) {
    return NextResponse.json(
      { error: "resume_id and job_listing_id are required" },
      { status: 400 }
    );
  }

  // Fetch resume
  const { data: resume } = await supabase
    .from("resumes")
    .select("extracted_text, file_name")
    .eq("id", resume_id)
    .eq("user_id", user.id)
    .single();

  if (!resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (!resume.extracted_text) {
    return NextResponse.json(
      { error: "This resume has no extracted text. Please upload a .txt resume for AI tailoring." },
      { status: 400 }
    );
  }

  // Fetch job listing
  const { data: job } = await supabase
    .from("job_listings")
    .select("title, description, requirements, skills")
    .eq("id", job_listing_id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job listing not found" }, { status: 404 });
  }

  // Build job description text
  const jobDescription = [
    `Title: ${job.title}`,
    `Description: ${job.description}`,
    job.requirements ? `Requirements: ${job.requirements}` : "",
    job.skills?.length ? `Skills: ${job.skills.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Check if Gemini API key is configured
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your-gemini-api-key-here") {
    return NextResponse.json(
      { error: "Gemini API key is not configured. Please set GEMINI_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  try {
    const { tailoredResume, keywords } = await tailorResume(
      resume.extracted_text,
      jobDescription
    );

    // Save tailored resume to database
    const { data: saved, error: dbError } = await supabase
      .from("tailored_resumes")
      .insert({
        user_id: user.id,
        resume_id,
        job_listing_id,
        tailored_text: tailoredResume,
        keywords,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json(
        { error: `Failed to save tailored resume: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ tailored_resume: saved }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
