import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { extractText } from "unpdf";
// Import the new OpenRouter-powered extraction logic
import { generateResumeFromDocument } from "@/lib/gemini";

function deriveFallbackFirstName(email: string | null | undefined): string {
  const localPart = (email ?? "").split("@")[0]?.trim() ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || "User";
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

async function generateResumePdf(payload: {
  fullName: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
  experience: string[];
  education: string[];
  skills: string[];
  certifications: string[];
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const marginX = 50;
  let cursorY = 750;
  const lineHeight = 14;

  const drawLine = (text: string, size = 11, isBold = false, color = rgb(0.12, 0.12, 0.12)) => {
    page.drawText(text, { x: marginX, y: cursorY, size, font: isBold ? boldFont : font, color });
    cursorY -= lineHeight;
  };

  const drawSection = (title: string, lines: string[]) => {
    cursorY -= 6;
    drawLine(title, 12, true, rgb(0, 0.29, 0.63));
    for (const line of lines) {
      for (const wrapped of wrapText(line, 92)) drawLine(wrapped);
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const resumeBucketName = getResumeBucketName();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Validate File
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // 2. Extract raw text from document
  let extractedRawText = "";
  if (file.type === "application/pdf") {
    const arrayBuffer = await file.arrayBuffer();
    const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    extractedRawText = text;
  } else {
    extractedRawText = await file.text();
  }

  if (!extractedRawText.trim()) {
    return NextResponse.json({ error: "Could not extract text from document" }, { status: 400 });
  }

  // 3. Process via Claude 3.7 (OpenRouter)
  let aiResult;
  try {
    aiResult = await generateResumeFromDocument(extractedRawText, file.name);
  } catch (err) {
    console.error("AI Extraction failed:", err);
    return NextResponse.json({ error: "AI failed to parse the resume" }, { status: 500 });
  }

  const { extracted, resume: enhancedData } = aiResult;

  // 4. Generate the polished PDF
  const pdfPayload = {
    fullName: extracted.name || deriveFallbackFirstName(user.email),
    location: extracted.contact.location || "",
    email: extracted.contact.email || user.email || "",
    phone: extracted.contact.phone || "",
    summary: enhancedData.professionalSummary,
    experience: enhancedData.experience.map(e => `${e.title} at ${e.company} (${e.dateRange})\n${e.bullets.map(b => `• ${b}`).join("\n")}`),
    education: enhancedData.education.map(e => `${e.degree}, ${e.institution} (${e.graduationYear})${e.honors ? ` - ${e.honors}` : ""}`),
    skills: enhancedData.skills,
    certifications: enhancedData.certifications,
  };

  const pdfBytes = await generateResumePdf(pdfPayload);
  const storagePath = `${user.id}/${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}.pdf`;

  // 5. Upload to Storage
  const { error: uploadError } = await supabase.storage
    .from(resumeBucketName)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf" });

  if (uploadError) return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from(resumeBucketName).getPublicUrl(storagePath);

  // 6. Save to DB
  const { data: resume, error: dbError } = await supabase
    .from("resumes")
    .insert({
      candidate_id: user.id,
      title: `${extracted.name || file.name} - Enhanced Resume`,
      input_data: { source: "upload", file_name: file.name, extracted_raw: extracted },
      generated_content: { ai_sections: enhancedData },
      content_text: enhancedData.professionalSummary,
      pdf_url: publicUrl,
      gemini_model: "claude-3.7-sonnet", 
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: "Database save failed" }, { status: 500 });

  return NextResponse.json({ resume }, { status: 201 });
}