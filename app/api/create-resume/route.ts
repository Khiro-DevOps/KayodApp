import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateResumeSections } from "@/lib/gemini";

interface ResumeInput {
  resumeName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  certifications?: string;
}

function generateATSFriendlyResume(data: ResumeInput) {
  const skillsArray = data.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const certificationsArray = data.certifications
    ? data.certifications
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  // Create ATS-friendly plain text resume
  const atsResume = `
${data.fullName.toUpperCase()}
${data.location} | ${data.email} | ${data.phone}

PROFESSIONAL SUMMARY
${data.summary}

PROFESSIONAL EXPERIENCE
${data.experience}

EDUCATION
${data.education}

SKILLS
${skillsArray.join(" | ")}
${certificationsArray.length > 0 ? `\nCERTIFICATIONS\n${certificationsArray.join(" | ")}` : ""}
`.trim();

  return atsResume;
}

function generateATSFriendlyResumeFromAi(
  data: ResumeInput,
  generated: {
    professional_summary: string;
    experience_points: string[];
    education_points: string[];
    skills: string[];
    certifications: string[];
  }
) {
  return `
${data.fullName.toUpperCase()}
${data.location} | ${data.email} | ${data.phone}

PROFESSIONAL SUMMARY
${generated.professional_summary}

PROFESSIONAL EXPERIENCE
${generated.experience_points.join("\n")}

EDUCATION
${generated.education_points.join("\n")}

SKILLS
${generated.skills.join(" | ")}
${generated.certifications.length > 0 ? `\nCERTIFICATIONS\n${generated.certifications.join(" | ")}` : ""}
`.trim();
}

function generateResumeHTML(data: ResumeInput): string {
  const skillsArray = data.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const certificationsArray = data.certifications
    ? data.certifications
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background: white; }
        .container { max-width: 8.5in; height: 11in; margin: 0 auto; padding: 40px; background: white; }
        .header { border-bottom: 3px solid #0066cc; padding-bottom: 15px; margin-bottom: 20px; }
        .name { font-size: 28px; font-weight: bold; color: #000; margin-bottom: 5px; }
        .contact { font-size: 11px; color: #555; }
        .section { margin-bottom: 15px; }
        .section-title { font-size: 14px; font-weight: bold; color: white; background: #0066cc; padding: 5px 10px; margin-bottom: 8px; }
        .section-content { font-size: 11px; margin-left: 10px; }
        .skills-list { display: flex; flex-wrap: wrap; gap: 10px; }
        .skill-tag { background: #e8f0fe; color: #0066cc; padding: 3px 8px; border-radius: 3px; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="name">${data.fullName}</div>
          <div class="contact">${data.location} | ${data.email} | ${data.phone}</div>
        </div>

        <div class="section">
          <div class="section-title">PROFESSIONAL SUMMARY</div>
          <div class="section-content">${data.summary}</div>
        </div>

        <div class="section">
          <div class="section-title">PROFESSIONAL EXPERIENCE</div>
          <div class="section-content">${data.experience.replace(/\n/g, "<br>")}</div>
        </div>

        <div class="section">
          <div class="section-title">EDUCATION</div>
          <div class="section-content">${data.education.replace(/\n/g, "<br>")}</div>
        </div>

        <div class="section">
          <div class="section-title">SKILLS</div>
          <div class="skills-list">
            ${skillsArray.map((skill) => `<div class="skill-tag">${skill}</div>`).join("")}
          </div>
        </div>

        ${
          certificationsArray.length > 0
            ? `
        <div class="section">
          <div class="section-title">CERTIFICATIONS</div>
          <div class="section-content">
            ${certificationsArray.map((cert) => `<div style="margin-bottom: 5px;">• ${cert}</div>`).join("")}
          </div>
        </div>
        `
            : ""
        }
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ResumeInput;

    // Validate required fields
    if (!body.resumeName || !body.fullName || !body.email || !body.phone || !body.location || !body.summary || !body.experience || !body.education || !body.skills) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let aiGeneratedSections;
    let usedModel: string | null = null;

    try {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key-here") {
        aiGeneratedSections = await generateResumeSections(body);
        usedModel = "gemini-2.0-flash";
      }
    } catch (error) {
      console.error("Gemini generation failed, falling back to local formatting:", error);
    }

    // Generate ATS-friendly resume
    const atsResumeText = aiGeneratedSections
      ? generateATSFriendlyResumeFromAi(body, aiGeneratedSections)
      : generateATSFriendlyResume(body);

    // Generate HTML version for preview
    const resumeHTML = generateResumeHTML(body);

    // For preview, encode HTML as data URL
    const previewUrl = `data:text/html;charset=utf-8,${encodeURIComponent(resumeHTML)}`;

    // Prepare structured data
    const resumeData = {
      personal_info: {
        full_name: body.fullName,
        email: body.email,
        phone: body.phone,
        location: body.location,
      },
      summary: aiGeneratedSections?.professional_summary ?? body.summary,
      experience: aiGeneratedSections?.experience_points ?? body.experience.split("\n").map((s) => s.trim()).filter(Boolean),
      education: aiGeneratedSections?.education_points ?? body.education.split("\n").map((s) => s.trim()).filter(Boolean),
      skills: aiGeneratedSections?.skills ?? body.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      certifications: aiGeneratedSections?.certifications ?? (body.certifications
        ? body.certifications
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        : []),
    };

    // Save to database
    const { error, data } = await supabase
      .from("resumes")
      .insert({
        candidate_id: user.id,
        title: body.resumeName,
        input_data: resumeData,
        generated_content: {
          ats_text: atsResumeText,
          html: resumeHTML,
          ai_sections: aiGeneratedSections ?? null,
        },
        content_text: atsResumeText,
        pdf_url: null,
        gemini_model: usedModel,
      })
      .select();

    if (error) {
      console.error("Error creating resume:", error);
      return NextResponse.json({ error: "Failed to create resume" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      resume: data?.[0],
      previewUrl,
    });
  } catch (error) {
    console.error("Error in create-resume API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}