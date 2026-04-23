import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";
import { NextResponse } from "next/server";
import { generateResumeSections } from "@/lib/gemini";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

interface ResumePdfPayload {
  fullName: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
  experience: string[];
  education: string[];
  skills: string[];
  certifications: string[];
}

function deriveFallbackFirstName(email: string | null | undefined): string {
  const localPart = (email ?? "").split("@")[0]?.trim() ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || "User";
}

function normalizeFileName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function wrapText(text: string, maxCharsPerLine = 90): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

async function generateResumePdf(payload: ResumePdfPayload) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 50;
  let cursorY = 750;
  const lineHeight = 14;

  const drawLine = (text: string, size = 11, isBold = false, color = rgb(0.12, 0.12, 0.12)) => {
    page.drawText(text, {
      x: marginX,
      y: cursorY,
      size,
      font: isBold ? boldFont : font,
      color,
    });
    cursorY -= lineHeight;
  };

  const drawSection = (title: string, lines: string[]) => {
    cursorY -= 6;
    drawLine(title, 12, true, rgb(0, 0.29, 0.63));
    for (const line of lines) {
      for (const wrapped of wrapText(line, 92)) {
        drawLine(wrapped);
      }
    }
    cursorY -= 4;
  };

  drawLine(payload.fullName.toUpperCase(), 20, true);
  drawLine(`${payload.location} | ${payload.email} | ${payload.phone}`, 10, false, rgb(0.32, 0.32, 0.32));

  drawSection("PROFESSIONAL SUMMARY", wrapText(payload.summary, 95));
  drawSection("PROFESSIONAL EXPERIENCE", payload.experience);
  drawSection("EDUCATION", payload.education);
  drawSection("SKILLS", [payload.skills.join(" | ")]);

  if (payload.certifications.length > 0) {
    drawSection("CERTIFICATIONS", [payload.certifications.join(" | ")]);
  }

  return pdfDoc.save();
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

function generateResumeHTML(data: ResumeInput, ai?: {
  professional_summary: string;
  experience_points: string[];
  education_points: string[];
  skills: string[];
  certifications: string[];
}): string {
  const summary = ai?.professional_summary ?? data.summary;
  const experience = ai?.experience_points.join("\n") ?? data.experience;
  const education = ai?.education_points.join("\n") ?? data.education;
  const skillsArray = ai?.skills ?? data.skills.split(",").map(s => s.trim()).filter(Boolean);
  const certificationsArray = ai?.certifications ?? (data.certifications
    ? data.certifications.split(",").map(c => c.trim()).filter(Boolean)
    : []);

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
        .skills-list { display: flex; flex-wrap: wrap; gap: 10px; margin-left: 10px; }
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
          <div class="section-content">${summary}</div>
        </div>
        <div class="section">
          <div class="section-title">PROFESSIONAL EXPERIENCE</div>
          <div class="section-content">${experience.replace(/\n/g, "<br>")}</div>
        </div>
        <div class="section">
          <div class="section-title">EDUCATION</div>
          <div class="section-content">${education.replace(/\n/g, "<br>")}</div>
        </div>
        <div class="section">
          <div class="section-title">SKILLS</div>
          <div class="skills-list">
            ${skillsArray.map(skill => `<div class="skill-tag">${skill}</div>`).join("")}
          </div>
        </div>
        ${certificationsArray.length > 0 ? `
        <div class="section">
          <div class="section-title">CERTIFICATIONS</div>
          <div class="section-content">
            ${certificationsArray.map(cert => `<div style="margin-bottom:5px;">• ${cert}</div>`).join("")}
          </div>
        </div>` : ""}
      </div>
    </body>
    </html>
  `;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const resumeBucketName = getResumeBucketName();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // FK safety: resumes.candidate_id references profiles.id.
    // Ensure a profile row exists before inserting resume data.
    const { data: profileRow, error: profileLookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      return NextResponse.json(
        { error: `Profile lookup failed: ${profileLookupError.message}` },
        { status: 500 }
      );
    }

    if (!profileRow) {
      const adminClient = getAdminClient();
      const { error: ensureProfileError } = await adminClient.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          first_name: deriveFallbackFirstName(user.email),
          last_name: "",
          phone: "",
          role: "candidate",
        },
        { onConflict: "id" }
      );

      if (ensureProfileError) {
        return NextResponse.json(
          {
            error: `Profile missing and auto-create failed: ${ensureProfileError.message}`,
            user_id: user.id,
          },
          { status: 500 }
        );
      }
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
        usedModel = "gemini-1.5-flash";
      }
    } catch (error) {
      console.error("Gemini generation failed, falling back to local formatting:", error);
    }

    // Generate ATS-friendly resume
    const atsResumeText = aiGeneratedSections
      ? generateATSFriendlyResumeFromAi(body, aiGeneratedSections)
      : generateATSFriendlyResume(body);

    // Generate HTML version for preview
    const resumeHTML = generateResumeHTML(body, aiGeneratedSections);

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

    const pdfPayload: ResumePdfPayload = {
      fullName: body.fullName,
      location: body.location,
      email: body.email,
      phone: body.phone,
      summary: aiGeneratedSections?.professional_summary ?? body.summary,
      experience: aiGeneratedSections?.experience_points ?? body.experience.split("\n").map((s) => s.trim()).filter(Boolean),
      education: aiGeneratedSections?.education_points ?? body.education.split("\n").map((s) => s.trim()).filter(Boolean),
      skills: aiGeneratedSections?.skills ?? body.skills.split(",").map((s) => s.trim()).filter(Boolean),
      certifications: aiGeneratedSections?.certifications ?? (body.certifications
        ? body.certifications.split(",").map((c) => c.trim()).filter(Boolean)
        : []),
    };

    const pdfBytes = await generateResumePdf(pdfPayload);
    const safeTitle = normalizeFileName(body.resumeName || body.fullName || "resume");
    const storagePath = `${user.id}/${Date.now()}_${safeTitle}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(resumeBucketName)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to upload generated PDF: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(resumeBucketName).getPublicUrl(storagePath);

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
        pdf_url: publicUrl,
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
      pdfUrl: publicUrl,
    });
  } catch (error) {
    console.error("Error in create-resume API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}