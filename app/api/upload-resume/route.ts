import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { GoogleGenAI } from "@google/genai";
import { extractText } from "unpdf";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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

  const drawLine = (
    text: string,
    size = 11,
    isBold = false,
    color = rgb(0.12, 0.12, 0.12)
  ) => {
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
      for (const wrapped of wrapText(line, 92)) drawLine(wrapped);
    }
    cursorY -= 4;
  };

  drawLine(payload.fullName.toUpperCase(), 20, true);
  drawLine(
    `${payload.location} | ${payload.email} | ${payload.phone}`,
    10,
    false,
    rgb(0.32, 0.32, 0.32)
  );
  drawSection("PROFESSIONAL SUMMARY", wrapText(payload.summary, 95));
  drawSection("PROFESSIONAL EXPERIENCE", payload.experience);
  drawSection("EDUCATION", payload.education);
  drawSection("SKILLS", [payload.skills.join(" | ")]);
  if (payload.certifications.length > 0) {
    drawSection("CERTIFICATIONS", [payload.certifications.join(" | ")]);
  }

  return pdfDoc.save();
}

interface AiResumeOutput {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  professional_summary: string;
  experience_points: string[];
  education_points: string[];
  skills: string[];
  certifications: string[];
}

async function extractAndEnhanceWithGemini(
  file: File
): Promise<AiResumeOutput | null> {
  try {
    // Step 1 — Extract text from the file
    let extractedText = "";

    console.log("[DEBUG] file.type:", file.type);
    console.log("[DEBUG] file.name:", file.name);

    if (file.type === "text/plain") {
      extractedText = await file.text();
    } else if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const { text } = await extractText(new Uint8Array(arrayBuffer), {
        mergePages: true,
      });
      extractedText = text;
    } else {
      // DOC/DOCX — best effort
      extractedText = await file.text();
    }

    console.log("[DEBUG] extracted text length:", extractedText.length);
    console.log("[DEBUG] extracted text preview:", extractedText.slice(0, 300));

    if (!extractedText.trim()) {
      console.error("[DEBUG] No text extracted from file");
      return null;
    }

    // Step 2 — Send extracted text to Gemini for enhancement
    const prompt =
      "You are a senior HR professional and expert resume writer.\n\n" +
      "Below is raw text extracted from a resume. Parse it and return an improved, ATS-optimized version.\n\n" +
      "INSTRUCTIONS:\n" +
      "- Extract the candidate's real name, email, phone, and location from the text\n" +
      "- Rewrite the summary as a compelling 2-4 sentence professional pitch\n" +
      "- Transform experience into strong action-verb bullet points with measurable impact where inferable\n" +
      "- Rewrite education in clean standard format\n" +
      "- Expand skills list - infer related skills if clearly implied\n" +
      "- Do NOT fabricate companies, dates, degrees, or certifications not in the text\n" +
      "- Write in third-person implied style (no 'I' or 'my')\n" +
      "- Each experience bullet must start with a past-tense action verb\n\n" +
      "RESUME TEXT:\n" +
      "---\n" +
      extractedText +
      "\n---\n\n" +
      "Return ONLY valid JSON, no markdown, no explanation:\n" +
      "{\n" +
      '  "full_name": "Candidate Name",\n' +
      '  "email": "email@example.com",\n' +
      '  "phone": "+1234567890",\n' +
      '  "location": "City, Country",\n' +
      '  "professional_summary": "2-4 sentence summary",\n' +
      '  "experience_points": ["Action verb + task + result"],\n' +
      '  "education_points": ["Degree, Institution, Year"],\n' +
      '  "skills": ["skill1", "skill2"],\n' +
      '  "certifications": ["cert1"]\n' +
      "}";

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = response.text?.trim() ?? "";
    console.log("[DEBUG] Gemini raw response:", raw.slice(0, 500));

    const clean = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : raw;

    const parsed = JSON.parse(clean) as AiResumeOutput;

    if (!parsed.full_name || !parsed.professional_summary) {
      console.error("[DEBUG] Gemini returned incomplete data:", parsed);
      return null;
    }

    return parsed;
  } catch (err) {
  console.error("[DEBUG] Gemini file extraction failed:", err);
  // Log the full error stack
  if (err instanceof Error) {
    console.error("[DEBUG] Error message:", err.message);
    console.error("[DEBUG] Error stack:", err.stack);
  }
  return null;
}
}

export async function POST(request: Request) {
  console.log("[DEBUG] upload-resume POST started");

  const supabase = await createClient();
  const resumeBucketName = getResumeBucketName();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Profile FK safety
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
        { error: `Profile auto-create failed: ${ensureProfileError.message}` },
        { status: 500 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  console.log("[DEBUG] file received:", file.name, file.type, file.size);

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
  }

  // Extract and enhance via Gemini
  const aiOutput = await extractAndEnhanceWithGemini(file);
  console.log("[DEBUG] aiOutput:", JSON.stringify(aiOutput, null, 2));

  // Generate improved PDF from AI output
  const pdfPayload = {
    fullName: aiOutput?.full_name ?? deriveFallbackFirstName(user.email),
    location: aiOutput?.location ?? "",
    email: aiOutput?.email ?? user.email ?? "",
    phone: aiOutput?.phone ?? "",
    summary: aiOutput?.professional_summary ?? "",
    experience: aiOutput?.experience_points ?? [],
    education: aiOutput?.education_points ?? [],
    skills: aiOutput?.skills ?? [],
    certifications: aiOutput?.certifications ?? [],
  };

  const pdfBytes = await generateResumePdf(pdfPayload);

  // Fix double extension issue
  const sanitizedName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.pdf$/i, "");
  const storagePath = `${user.id}/${Date.now()}_${sanitizedName}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(resumeBucketName)
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = supabase.storage
    .from(resumeBucketName)
    .getPublicUrl(storagePath);

  const { data: resume, error: dbError } = await supabase
    .from("resumes")
    .insert({
      candidate_id: user.id,
      title: aiOutput?.full_name
        ? `${aiOutput.full_name} - Resume`
        : file.name.replace(/\.[^/.]+$/, ""),
      input_data: {
        source: "upload",
        file_name: file.name,
        ai_extracted: aiOutput ?? null,
      },
      generated_content: {
        upload: true,
        ai_sections: aiOutput ?? null,
      },
      content_text: aiOutput
        ? [
            aiOutput.professional_summary,
            ...aiOutput.experience_points,
            ...aiOutput.education_points,
            ...aiOutput.skills,
          ].join("\n")
        : null,
      pdf_url: publicUrl,
      gemini_model: aiOutput ? "gemini-1.5-flash" : null,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from(resumeBucketName).remove([storagePath]);
    return NextResponse.json(
      { error: `Failed to save resume: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ resume }, { status: 201 });
}