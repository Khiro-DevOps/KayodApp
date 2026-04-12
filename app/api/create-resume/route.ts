import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      fullName,
      email,
      phone,
      location,
      summary,
      experience,
      education,
      skills,
      certifications,
    } = body;

    // Validate required fields
    if (!fullName || !email || !phone || !location || !summary || !experience || !education || !skills) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Prepare data for AI processing
    const resumeData = {
      personal_info: {
        full_name: fullName,
        email,
        phone,
        location,
      },
      summary,
      experience,
      education,
      skills: skills.split(",").map((s: string) => s.trim()).filter(Boolean),
      certifications: certifications ? certifications.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    };

    // Here you would integrate with Gemini AI to generate the resume
    // For now, we'll create a basic structure
    const generatedContent = {
      personal_info: resumeData.personal_info,
      summary: resumeData.summary,
      experience: resumeData.experience.split("\n").filter(line => line.trim()),
      education: resumeData.education.split("\n").filter(line => line.trim()),
      skills: resumeData.skills,
      certifications: resumeData.certifications,
    };

    // Save to database
    const { error } = await supabase
      .from("resumes")
      .insert({
        candidate_id: user.id,
        input_data: resumeData,
        generated_content: generatedContent,
        title: `${fullName}'s Resume`,
      });

    if (error) {
      console.error("Error creating resume:", error);
      return NextResponse.json({ error: "Failed to create resume" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in create-resume API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}