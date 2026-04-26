import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";
import { NextResponse } from "next/server";
import { generateResumeSections, ResumeOutput } from "@/lib/gemini";
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

  return `
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
}

// FIXED: Maps correctly to the array of objects returned by gemini.ts
function generateATSFriendlyResumeFromAi(data: ResumeInput, generated: ResumeOutput) {
  const expText = generated.experience
    .map((e) => `${e.title.toUpperCase()} | ${e.company} | ${e.dateRange}\n${e.bullets.map((b) => `• ${b}`).join("\n")}`)
    .join("\n\n");

  const eduText = generated.education
    .map((e) => `${e.degree} — ${e.institution} (${e.graduationYear})${e.honors ? ` | ${e.honors}` : ""}`)
    .join("\n\n");

  return `
${data.fullName.toUpperCase()}
${data.location} | ${data.email} | ${data.phone}

PROFESSIONAL SUMMARY
${generated.professionalSummary}

PROFESSIONAL EXPERIENCE
${expText}

EDUCATION
${eduText}

SKILLS
${generated.skills.join(" | ")}
${generated.certifications.length > 0 ? `\nCERTIFICATIONS\n${generated.certifications.join(" | ")}` : ""}
`.trim();
}

// FIXED: Adjusted to correctly parse object fields into HTML
function generateResumeHTML(data: ResumeInput, ai?: ResumeOutput): string {
  const summary = ai?.professionalSummary ?? data.summary;
  
  const experience = ai
    ? ai.experience.map((e) => `<strong>${e.title}</strong> | ${e.company} | ${e.dateRange}<br/>` + e.bullets.map((b) => `• ${b}`).join("<br/>")).join("<br/><br/>")
    : data.experience.replace(/\n/g, "<br>");
    
  const education = ai
    ? ai.education.map((e) => `<strong>${e.degree}</strong> — ${e.institution} (${e.graduationYear})` + (e.honors ? `<br/><em>${e.honors}</em>` : "")).join("<br/><br/>")
    : data.education.replace(/\n/g, "<br>");
    
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
          <div class="section-content">${experience}</div>
        </div>
        <div class="section">
          <div class="section-title">EDUCATION</div>
          <div class="section-content">${education}</div>
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

    if (!body.resumeName || !body.fullName || !body.email || !body.phone || !body.location || !body.summary || !body.experience || !body.education || !body.skills) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let aiGeneratedSections: ResumeOutput | undefined;
    let usedModel: string | null = null;

    try {
      // FIXED: Checking for the correct environment variable
      if (process.env.OPENROUTER_API_KEY) {
        console.log("Triggering AI synthesis via OpenRouter...");
        aiGeneratedSections = await generateResumeSections(body);
        usedModel = "claude-3.7-sonnet";
      } else {
        console.warn("No OPENROUTER_API_KEY found, skipping AI enhancement.");
      }
    } catch (error) {
      console.error("AI generation failed, falling back to local formatting:", error);
    }

    const atsResumeText = aiGeneratedSections
      ? generateATSFriendlyResumeFromAi(body, aiGeneratedSections)
      : generateATSFriendlyResume(body);

    const resumeHTML = generateResumeHTML(body, aiGeneratedSections);
    const previewUrl = `data:text/html;charset=utf-8,${encodeURIComponent(resumeHTML)}`;

    // Prepare arrays for PDF Payload line wrapping
    const formatPdfExperience = () => {
      if (!aiGeneratedSections) return body.experience.split("\n").map(s => s.trim()).filter(Boolean);
      return aiGeneratedSections.experience.flatMap((e) => [
        `${e.title} | ${e.company} | ${e.dateRange}`,
        ...e.bullets.map((b) => `• ${b}`),
        "" // Add empty line for spacing between entries
      ]);
    };

    const formatPdfEducation = () => {
      if (!aiGeneratedSections) return body.education.split("\n").map(s => s.trim()).filter(Boolean);
      return aiGeneratedSections.education.flatMap((e) => [
        `${e.degree} — ${e.institution} (${e.graduationYear})`,
        ...(e.honors ? [e.honors] : []),
        ""
      ]);
    };

    // Prepare structured data matching the DB expectations
    const resumeData = {
      personal_info: {
        full_name: body.fullName,
        email: body.email,
        phone: body.phone,
        location: body.location,
      },
      summary: aiGeneratedSections?.professionalSummary ?? body.summary,
      experience: aiGeneratedSections?.experience ?? body.experience.split("\n").map((s) => s.trim()).filter(Boolean),
      education: aiGeneratedSections?.education ?? body.education.split("\n").map((s) => s.trim()).filter(Boolean),
      skills: aiGeneratedSections?.skills ?? body.skills.split(",").map((s) => s.trim()).filter(Boolean),
      certifications: aiGeneratedSections?.certifications ?? (body.certifications ? body.certifications.split(",").map((c) => c.trim()).filter(Boolean) : []),
    };

    const pdfPayload: ResumePdfPayload = {
      fullName: body.fullName,
      location: body.location,
      email: body.email,
      phone: body.phone,
      summary: aiGeneratedSections?.professionalSummary ?? body.summary,
      experience: formatPdfExperience(),
      education: formatPdfEducation(),
      skills: aiGeneratedSections?.skills ?? body.skills.split(",").map((s) => s.trim()).filter(Boolean),
      certifications: aiGeneratedSections?.certifications ?? (body.certifications ? body.certifications.split(",").map((c) => c.trim()).filter(Boolean) : []),
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