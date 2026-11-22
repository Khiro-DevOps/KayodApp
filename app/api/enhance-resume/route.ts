import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatResumeSectionsToFields,
  generateResumeSectionsWithFallback,
} from "@/lib/gemini";

interface EnhanceResumeBody {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: string;
  education?: string;
  skills?: string;
  certifications?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as EnhanceResumeBody;
    const summary = (body.summary ?? "").trim();
    const experience = (body.experience ?? "").trim();
    const education = (body.education ?? "").trim();
    const skills = (body.skills ?? "").trim();
    const certifications = (body.certifications ?? "").trim();

    if (!summary && !experience && !education && !skills && !certifications) {
      return NextResponse.json(
        { error: "Enter at least one resume section to polish with Kayod AI." },
        { status: 400 }
      );
    }

    const { sections, model, usedFallback } = await generateResumeSectionsWithFallback({
      fullName: (body.fullName ?? "").trim() || "Candidate",
      email: (body.email ?? "").trim() || user.email || "",
      phone: (body.phone ?? "").trim(),
      location: (body.location ?? "").trim(),
      summary: summary || "Dedicated professional seeking to contribute skills and experience.",
      experience,
      education,
      skills,
      certifications: certifications || undefined,
    });

    const formatted = formatResumeSectionsToFields(sections);

    return NextResponse.json({
      summary: summary || !usedFallback ? formatted.summary : "",
      experience: experience ? formatted.experience : "",
      education: education ? formatted.education : "",
      skills: skills ? formatted.skills : "",
      certifications: certifications ? formatted.certifications : "",
      usedAi: !usedFallback,
      model,
    });
  } catch (error) {
    console.error("Error in enhance-resume API:", error);
    return NextResponse.json(
      { error: "Failed to polish resume fields" },
      { status: 500 }
    );
  }
}
