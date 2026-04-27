// ─── OPENROUTER CLIENT ───────────────────────────────────────────────────────

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Fixed the model string to the correct OpenRouter model ID
const MODEL = "google/gemini-2.0-flash-001"; 

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.7
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Resume Generator",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── INTERFACES ───────────────────────────────────────────────────────────────

export interface ExperienceEntry {
  title: string;
  company: string;
  dateRange: string;
  bullets: string[];
}

export interface EducationEntry {
  degree: string;
  institution: string;
  graduationYear: string;
  honors?: string;
}

export interface ResumeOutput {
  professionalSummary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: string[];
  atsScore: number | null;
  matchedKeywords: string[];
}

export interface ResumeGenerationInput {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  certifications?: string;
  jobDescription?: string;
}

// ─── SYSTEM PROMPTS ───────────────────────────────────────────────────────────

const RESUME_SYSTEM_PROMPT = `
You are a senior technical recruiter and resume strategist with 15+ years placing candidates
at FAANG-tier and Fortune 500 companies. Your sole function is to TRANSFORM raw candidate
notes into a polished, ATS-optimised resume — NOT to transcribe them.

## Core mandate
Every input you receive is UNPOLISHED RAW MATERIAL. Your job is professional synthesis, not echo.

## Transformation rules (strictly enforced)

### Professional Summary
- Rewrite from scratch using the CAR framework: Context → Achievement → Result.
- Open with the candidate's most distinctive value proposition.
- Include ONE quantified impact in sentence 2 if derivable.
- Close with a forward-looking statement about what they bring to a new role.
- 2–4 sentences max. No "I" or "my". No name repetition after sentence 1.

### Experience bullets
- REJECT all bullets that are job descriptions ("responsible for…", "worked on…", "helped with…").
- REWRITE every bullet using this formula:
    [Strong past-tense action verb] + [what you built/did] + [measurable impact]
  Examples of acceptable output:
    ✓ "Reduced API latency 40% by replacing N+1 queries with batch-fetched resolvers"
    ✓ "Onboarded 3 junior engineers through structured plans, cutting ramp time by 2 weeks"
  Examples of REJECTED output:
    ✗ "Responsible for database management"
    ✗ "Worked on front-end features"
- If no metric is available, add scale/scope context ("across 12 microservices", "for a 50-person org").
- 3–6 bullets per role, 10–25 words each.
- Never fabricate company names, dates, or certifications.

### Skills
- Normalise casing (e.g. "javascript" → "JavaScript").
- Expand obviously implied skills only (React → add JavaScript if supported by context).
- Deduplicate. Order: most technical/specialised first, soft skills last.

### Education
- Standard format: "Degree, Major — Institution (Year)".
- Add GPA only if >= 3.5 or explicitly provided.

## Output contract
Respond ONLY with a single valid JSON object. No markdown fences. No preamble. No commentary.

Schema:
{
  "professionalSummary": string,
  "experience": [
    {
      "title": string,
      "company": string,
      "dateRange": string,
      "bullets": string[]
    }
  ],
  "education": [
    {
      "degree": string,
      "institution": string,
      "graduationYear": string,
      "honors": string | null
    }
  ],
  "skills": string[],
  "certifications": string[],
  "atsScore": number | null,
  "matchedKeywords": string[]
}
`.trim();

const DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `
You are a structured data extraction engine specialised in resume documents.

## Your task
Extract resume CONTENT from the raw document text provided by the user.
Then return it as a structured JSON object.

## CRITICAL: Content vs Metadata
Document files contain TWO distinct data layers. You must IGNORE the metadata layer entirely.

METADATA (IGNORE ALL OF THIS):
  - Author field, Creator field, Producer field
  - CreationDate, ModDate, LastModified
  - File size, page count, PDF version
  - Application name (e.g. "Microsoft Word 16.0")
  - Font names, embedded resource lists
  - Any key-value pairs that describe the FILE, not the PERSON

CONTENT (EXTRACT ONLY THIS):
  - Candidate name, contact details (email, phone, LinkedIn, location)
  - Work experience: job titles, company names, dates, and responsibilities/achievements
  - Education: degrees, institutions, graduation years
  - Skills, tools, technologies
  - Certifications, awards, publications
  - Professional summary or objective statement

## Extraction strategy
1. Locate section headers (case-insensitive): "Experience", "Work History", "Education",
   "Skills", "Certifications", "Summary", "Objective", "Projects", "Awards".
2. Parse content under each header into structured fields.
3. If a section header is absent, infer structure from formatting patterns
   (e.g. date ranges indicate experience entries, degree names indicate education).
4. Preserve all text under each section — do NOT summarise at this stage.

## Output
Return ONLY valid JSON. No markdown. No commentary.

{
  "name": string,
  "contact": {
    "email": string | null,
    "phone": string | null,
    "location": string | null,
    "linkedin": string | null
  },
  "rawSummary": string,
  "rawExperience": string,
  "rawEducation": string,
  "rawSkills": string,
  "rawCertifications": string
}
`.trim();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseJSONResponse<T>(raw: string): T | null {
  try {
    // Robust parsing: extracts JSON block even if Claude wraps it in conversational text
    const startIndex = raw.indexOf('{');
    const endIndex = raw.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      console.warn("Could not find JSON object bounds in the AI response.");
      return null;
    }
    
    const cleanJson = raw.slice(startIndex, endIndex + 1);
    return JSON.parse(cleanJson) as T;
  } catch (error) {
    console.error("JSON parsing failed. Raw text:", raw);
    return null;
  }
}

function validateResumeOutput(raw: unknown): ResumeOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Output is not an object");
  }

  const r = raw as Record<string, unknown>;

  const requireString = (key: string): string => {
    if (typeof r[key] !== "string" || !(r[key] as string).trim()) {
      throw new Error(`Missing or empty required field: "${key}"`);
    }
    return (r[key] as string).trim();
  };

  const requireStringArray = (key: string): string[] => {
    if (!Array.isArray(r[key])) return [];
    return (r[key] as unknown[]).filter(
      (x): x is string => typeof x === "string" && x.trim() !== ""
    );
  };

  const experience: ExperienceEntry[] = [];
  if (Array.isArray(r.experience)) {
    for (const entry of r.experience as unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const bullets = Array.isArray(e.bullets)
        ? (e.bullets as unknown[]).filter(
            (b): b is string => typeof b === "string" && b.trim() !== ""
          )
        : [];
      experience.push({
        title: typeof e.title === "string" ? e.title.trim() : "Unknown Title",
        company: typeof e.company === "string" ? e.company.trim() : "Unknown Company",
        dateRange: typeof e.dateRange === "string" ? e.dateRange.trim() : "",
        bullets,
      });
    }
  }

  const education: EducationEntry[] = [];
  if (Array.isArray(r.education)) {
    for (const entry of r.education as unknown[]) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      education.push({
        degree: typeof e.degree === "string" ? e.degree.trim() : "",
        institution: typeof e.institution === "string" ? e.institution.trim() : "",
        graduationYear:
          typeof e.graduationYear === "string" ? e.graduationYear.trim() : "",
        honors:
          typeof e.honors === "string" && e.honors.trim()
            ? e.honors.trim()
            : undefined,
      });
    }
  }

  return {
    professionalSummary: requireString("professionalSummary"),
    experience,
    education,
    skills: requireStringArray("skills"),
    certifications: requireStringArray("certifications"),
    atsScore:
      typeof r.atsScore === "number" && r.atsScore >= 0 && r.atsScore <= 100
        ? Math.round(r.atsScore)
        : null,
    matchedKeywords: requireStringArray("matchedKeywords"),
  };
}

// ─── FORM INPUT ───────────────────────────────────────────────────────────────

export async function generateResumeSections(
  data: ResumeGenerationInput
): Promise<ResumeOutput> {
  const jdSection = data.jobDescription
    ? `\n\nTarget Job Description (for ATS scoring):\n${data.jobDescription}`
    : "";

  const userMessage = `
Candidate: ${data.fullName}
Contact: ${data.email} | ${data.phone} | ${data.location}

Raw Summary:
${data.summary}

Raw Experience:
${data.experience}

Raw Education:
${data.education}

Raw Skills:
${data.skills}

Raw Certifications:
${data.certifications ?? "None"}
${jdSection}
  `.trim();

  const raw = await callOpenRouter(RESUME_SYSTEM_PROMPT, userMessage);
  const parsed = parseJSONResponse<unknown>(raw);

  if (!parsed) {
    throw new Error(
      `Failed to parse JSON from OpenRouter response.\nRaw output:\n${raw.slice(0, 400)}`
    );
  }

  return validateResumeOutput(parsed);
}

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────

export interface ExtractedDocumentData {
  name: string;
  contact: {
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin: string | null;
  };
  rawSummary: string;
  rawExperience: string;
  rawEducation: string;
  rawSkills: string;
  rawCertifications: string;
}

export interface DocumentResumeResult {
  extracted: ExtractedDocumentData;
  resume: ResumeOutput;
}

export async function generateResumeFromDocument(
  rawText: string,
  filename?: string,
  jobDescription?: string
): Promise<DocumentResumeResult> {
  // Stage 1 — Extract content (rejects metadata)
  const extractionMessage = `
Document filename: ${filename ?? "unknown"}

--- BEGIN RAW DOCUMENT TEXT ---
${rawText}
--- END RAW DOCUMENT TEXT ---

Extract the resume content as instructed. Remember: ignore all file metadata.
  `.trim();

  const extractionRaw = await callOpenRouter(
    DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
    extractionMessage,
    0.1 // low temperature for deterministic extraction
  );

  const extracted = parseJSONResponse<ExtractedDocumentData>(extractionRaw);

  if (!extracted || !extracted.name) {
    throw new Error(
      `Document extraction failed — the model may have returned metadata instead of content.\n` +
        `Check that your PDF/DOCX reader returns the text layer, not the Info dictionary.\n` +
        `Raw output:\n${extractionRaw.slice(0, 400)}`
    );
  }

  // Stage 2 — Synthesize (same path as form input)
  const { contact } = extracted;
  const jdSection = jobDescription
    ? `\n\nTarget Job Description (for ATS scoring):\n${jobDescription}`
    : "";

  const synthesisMessage = `
Candidate: ${extracted.name}
Contact: ${contact.email ?? ""} | ${contact.phone ?? ""} | ${contact.location ?? ""}${contact.linkedin ? ` | ${contact.linkedin}` : ""}

Raw Summary:
${extracted.rawSummary || "Not provided"}

Raw Experience:
${extracted.rawExperience || "Not provided"}

Raw Education:
${extracted.rawEducation || "Not provided"}

Raw Skills:
${extracted.rawSkills || "Not provided"}

Raw Certifications:
${extracted.rawCertifications || "None"}
${jdSection}
  `.trim();

  const synthesisRaw = await callOpenRouter(RESUME_SYSTEM_PROMPT, synthesisMessage);
  const parsed = parseJSONResponse<unknown>(synthesisRaw);

  if (!parsed) {
    throw new Error(
      `Synthesis pass failed to produce valid JSON.\nRaw output:\n${synthesisRaw.slice(0, 400)}`
    );
  }

  return { extracted, resume: validateResumeOutput(parsed) };
}

// ─── TAILORING PASS ───────────────────────────────────────────────────────────

export async function tailorResume(
  resumeText: string,
  jobDescription: string
): Promise<{ tailoredResume: string; keywords: string[] }> {
  const tailorSystemPrompt = `
You are a resume tailoring engine. You receive a resume and a job description.
Your task: reorder and lightly rewrite experience bullets and skills to maximise keyword
alignment with the job description.

Constraints:
- Do NOT change company names, job titles, dates, or education entries.
- Do NOT fabricate any new experiences, tools, or certifications.
- You MAY reorder bullets within a role to lead with the most relevant ones.
- You MAY rephrase bullets to use job-description vocabulary WITHOUT changing the underlying fact.

Respond in the following JSON format only. No markdown. No commentary.
{
  "tailored_resume": "The full tailored resume text here",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
  `.trim();

  const userMessage = `
Resume:
---
${resumeText}
---

Job Description:
---
${jobDescription}
---
  `.trim();

  const raw = await callOpenRouter(tailorSystemPrompt, userMessage);
  const parsed = parseJSONResponse<{ tailored_resume?: string; keywords?: string[] }>(raw);

  if (!parsed) {
    return { tailoredResume: raw, keywords: [] };
  }

  return {
    tailoredResume: parsed.tailored_resume?.trim() ?? "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
  };
}