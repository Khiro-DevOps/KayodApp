import { computeMatchScore } from "@/lib/match-score";

// ─── ERROR TYPES ──────────────────────────────────────────────────────────────

export class OpenRouterError extends Error {
  constructor(
    public status: number,
    public isRateLimited: boolean,
    public isTransient: boolean,
    public retryAfterSeconds?: number,
    message?: string
  ) {
    super(message || `OpenRouter error ${status}`);
    this.name = "OpenRouterError";
  }
}

/**
 * Checks if a status code indicates a transient error that should be retried.
 * Transient errors include rate limiting (429) and server errors (502, 503, 504).
 */
function isTransientError(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

// ─── REQUEST QUEUE ────────────────────────────────────────────────────────────

interface QueuedRequest {
  id: string;
  execute: () => Promise<string>;
  retries: number;
  maxRetries: number;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private maxConcurrent = 1; // Process one request at a time to avoid rate limits

  async enqueue(
    execute: () => Promise<string>,
    maxRetries = 3
  ): Promise<string> {
    const id = `${Date.now()}_${Math.random()}`;
    const request: QueuedRequest = { id, execute, retries: 0, maxRetries };

    return new Promise<string>((resolve, reject) => {
      this.queue.push(request);
      this.processQueue().then(() => {}).catch(err => console.error("Queue start error:", err));
      
      // Execute this request with retry logic
      this.executeWithBackoff(request)
        .then(resolve)
        .catch(reject);
    });
  }

  private async executeWithBackoff(request: QueuedRequest): Promise<string> {
    while (request.retries <= request.maxRetries) {
      try {
        return await request.execute();
      } catch (error) {
        if (error instanceof OpenRouterError && error.isTransient) {
          request.retries++;
          if (request.retries <= request.maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const delayMs = Math.pow(2, request.retries) * 1000;
            const errorType = error.isRateLimited ? "rate limited" : `server error (${error.status})`;
            console.warn(
              `API ${errorType}. Retry ${request.retries}/${request.maxRetries} after ${delayMs}ms`
            );
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
        }
        throw error;
      }
    }
    throw new OpenRouterError(429, true, true, undefined, "Max retries exceeded");
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      // Just remove from queue; the actual execution happens in enqueue's promise
      if (!request) break;
    }

    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

// ─── OPENROUTER CLIENT ───────────────────────────────────────────────────────

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Fixed the model string to the correct OpenRouter model ID
const MODEL = "google/gemini-2.0-flash-001"; 

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.7
): Promise<string> {
  return requestQueue.enqueue(async () => {
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
      const isRateLimited = response.status === 429;
      const isTransient = isTransientError(response.status);
      
      if (isRateLimited) {
        // Extract retry-after if available
        const retryAfter = response.headers.get("retry-after");
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        throw new OpenRouterError(
          response.status,
          true,
          true,
          retryAfterSeconds,
          `API rate limited. Please try again in ${retryAfterSeconds || 60} seconds.`
        );
      }
      
      if (isTransient) {
        // Server-side transient error (502, 503, 504, etc.)
        throw new OpenRouterError(
          response.status,
          false,
          true,
          undefined,
          `OpenRouter server temporarily unavailable (${response.status}). Retrying...`
        );
      }
      
      // Permanent error (4xx client errors, etc.)
      throw new OpenRouterError(
        response.status,
        false,
        false,
        undefined,
        `OpenRouter error ${response.status}: ${err}`
      );
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  });
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

export interface JobFitAnalysisInput {
  resumeData: string | Record<string, unknown>;
  jobRequirements: string | Record<string, unknown>;
  fallbackScore?: number;
}

export interface JobFitAnalysisOutput {
  fit_score: number;
  match_level: "High" | "Medium" | "Low";
  top_reasons: string[];
  gap_analysis: string;
  card_color_hex: string;
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
  "name": sI tring,
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

const JOB_FIT_SYSTEM_PROMPT = `
You are a recruitment logic engine for a B2B SaaS hiring platform.

Convert the provided resume data and job requirements into a precise job fit score for a
"Jobs for you" card.

Scoring hierarchy:
- Tech Stack Alignment: 50%
- Experience Parity: 30%
- Domain Relevance: 20%

Rules:
- Be highly critical and conservative.
- Penalize missing must-have technologies heavily.
- If a must-have skill is absent, cap the score aggressively even if the resume is otherwise strong.
- Use only the information explicitly present in the inputs.
- Keep reasons concise enough for a small UI card.
- Return exactly 2 items in top_reasons when possible.
- Do not output markdown, code fences, or commentary.
- card_color_hex must be a valid hex color string that matches the match level.

Match level guidance:
- High: 75-100, strong alignment across tech, experience, and domain
- Medium: 45-74, partial alignment with some gaps
- Low: 0-44, major gaps or missing core requirements

Output ONLY this JSON object:
{
  "fit_score": integer,
  "match_level": "High" | "Medium" | "Low",
  "top_reasons": [string, string],
  "gap_analysis": string,
  "card_color_hex": string
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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function resolveMatchLevel(score: number): JobFitAnalysisOutput["match_level"] {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function resolveCardColorHex(level: JobFitAnalysisOutput["match_level"]): string {
  if (level === "High") return "#16A34A";
  if (level === "Medium") return "#F59E0B";
  return "#9CA3AF";
}

function toPromptText(value: string | Record<string, unknown>): string {
  if (typeof value === "string") {
    return value.trim();
  }

  return JSON.stringify(value, null, 2);
}

function toJobData(jobRequirements: string | Record<string, unknown>) {
  if (typeof jobRequirements === "string") {
    return {
      title: "",
      description: jobRequirements,
      requirements: null,
      required_skills: [] as string[],
    };
  }

  const data = jobRequirements as Record<string, unknown>;
  return {
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : JSON.stringify(data),
    requirements: typeof data.requirements === "string" ? data.requirements : null,
    required_skills: Array.isArray(data.required_skills)
      ? (data.required_skills as unknown[]).filter(
          (skill): skill is string => typeof skill === "string" && skill.trim() !== ""
        )
      : [],
  };
}

function normalizeJobFitOutput(raw: unknown, fallbackScore?: number): JobFitAnalysisOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Output is not an object");
  }

  const r = raw as Record<string, unknown>;
  const fitScore =
    typeof r.fit_score === "number" && Number.isFinite(r.fit_score)
      ? clampScore(r.fit_score)
      : fallbackScore !== undefined
        ? clampScore(fallbackScore)
        : 0;

  const matchLevel =
    r.match_level === "High" || r.match_level === "Medium" || r.match_level === "Low"
      ? r.match_level
      : resolveMatchLevel(fitScore);

  const topReasons = Array.isArray(r.top_reasons)
    ? (r.top_reasons as unknown[])
        .filter((reason): reason is string => typeof reason === "string" && reason.trim() !== "")
        .slice(0, 2)
    : [];

  while (topReasons.length < 2) {
    topReasons.push(matchLevel === "Low" ? "Missing core requirements" : "Partial alignment with the role");
  }

  const gapAnalysis =
    typeof r.gap_analysis === "string" && r.gap_analysis.trim()
      ? r.gap_analysis.trim()
      : matchLevel === "High"
        ? "Minor gaps only; this profile aligns closely with the role."
        : matchLevel === "Medium"
          ? "Some requirements are covered, but there are notable gaps in stack or seniority."
          : "The resume is missing core technologies, seniority signals, or domain experience.";

  const colorHex =
    typeof r.card_color_hex === "string" && /^#([0-9a-fA-F]{6})$/.test(r.card_color_hex.trim())
      ? r.card_color_hex.trim()
      : resolveCardColorHex(matchLevel);

  return {
    fit_score: fitScore,
    match_level: matchLevel,
    top_reasons: topReasons,
    gap_analysis: gapAnalysis,
    card_color_hex: colorHex,
  };
}

function fallbackJobFit(
  resumeData: string | Record<string, unknown>,
  jobRequirements: string | Record<string, unknown>,
  fallbackScore?: number
): JobFitAnalysisOutput {
  const jobData = toJobData(jobRequirements);
  const score =
    typeof fallbackScore === "number"
      ? clampScore(fallbackScore)
      : computeMatchScore(toPromptText(resumeData), jobData);

  const level = resolveMatchLevel(score);
  const resumeText = toPromptText(resumeData).toLowerCase();
  const jobText = toPromptText(jobRequirements).toLowerCase();

  const reasons = [
    score >= 70
      ? "Strong overlap across required technologies and role scope"
      : score >= 45
        ? "Some relevant skills match the job, but not the full stack"
        : "Core job requirements are only partially represented in the resume",
    jobText.includes("next.js") && resumeText.includes("next.js")
      ? "Next.js is explicitly present in both the resume and the job"
      : jobText.includes("next.js")
        ? "The role emphasizes Next.js, but the resume does not show it clearly"
        : "Technology stack alignment is driven more by general similarity than explicit match",
  ];

  return {
    fit_score: score,
    match_level: level,
    top_reasons: reasons.slice(0, 2),
    gap_analysis:
      level === "High"
        ? "Only small gaps remain; the candidate is close to the target profile."
        : level === "Medium"
          ? "The profile matches part of the stack, but it needs stronger seniority or domain evidence."
          : "The profile is missing one or more must-have capabilities and should be treated cautiously.",
    card_color_hex: resolveCardColorHex(level),
  };
}

export async function analyzeJobFit(
  input: JobFitAnalysisInput
): Promise<JobFitAnalysisOutput> {
  if (!process.env.OPENROUTER_API_KEY) {
    return fallbackJobFit(input.resumeData, input.jobRequirements, input.fallbackScore);
  }

  const userMessage = `
[RESUME_DATA]
${toPromptText(input.resumeData)}

[JOB_REQUIREMENTS]
${toPromptText(input.jobRequirements)}
  `.trim();

  try {
    const raw = await callOpenRouter(JOB_FIT_SYSTEM_PROMPT, userMessage, 0.1);
    const parsed = parseJSONResponse<unknown>(raw);

    if (!parsed) {
      console.warn("Job fit analysis returned invalid JSON, using fallback");
      return fallbackJobFit(input.resumeData, input.jobRequirements, input.fallbackScore);
    }

    return normalizeJobFitOutput(parsed, input.fallbackScore);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      console.error(`Job fit analysis failed - ${error.message}`);
    } else {
      console.error("Job fit analysis error:", error);
    }
    return fallbackJobFit(input.resumeData, input.jobRequirements, input.fallbackScore);
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

  let extractionRaw: string;
  try {
    extractionRaw = await callOpenRouter(
      DOCUMENT_EXTRACTION_SYSTEM_PROMPT,
      extractionMessage,
      0.1 // low temperature for deterministic extraction
    );
  } catch (error) {
    if (error instanceof OpenRouterError) {
      if (error.isRateLimited) {
        throw new OpenRouterError(
          429,
          true,
          true,
          error.retryAfterSeconds,
          `The resume parsing service is temporarily overloaded. Please try again in ${error.retryAfterSeconds || 60} seconds.`
        );
      }
      throw new OpenRouterError(
        error.status,
        false,
        error.isTransient,
        undefined,
        `Failed to parse resume: ${error.message}`
      );
    }
    throw error;
  }

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

  let synthesisRaw: string;
  try {
    synthesisRaw = await callOpenRouter(RESUME_SYSTEM_PROMPT, synthesisMessage);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      if (error.isRateLimited) {
        throw new OpenRouterError(
          429,
          true,
          true,
          error.retryAfterSeconds,
          `The resume processing service is temporarily overloaded. Please try again in ${error.retryAfterSeconds || 60} seconds.`
        );
      }
      throw new OpenRouterError(
        error.status,
        false,
        error.isTransient,
        undefined,
        `Failed to enhance resume: ${error.message}`
      );
    }
    throw error;
  }

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