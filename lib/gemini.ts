import { computeCanonicalJobMatch } from "@/lib/match-scoring";

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
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  async enqueue(
    execute: () => Promise<string>,
    maxRetries = 3
  ): Promise<string> {
    const id = `${Date.now()}_${Math.random()}`;

    return new Promise<string>((resolve, reject) => {
      const request: QueuedRequest = {
        id,
        execute,
        retries: 0,
        maxRetries,
        resolve,
        reject,
      };
      this.queue.push(request);
      void this.processQueue();
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

    try {
      while (this.queue.length > 0) {
        const request = this.queue.shift();
        if (!request) break;
        try {
          const result = await this.executeWithBackoff(request);
          request.resolve(result);
        } catch (err) {
          request.reject(err);
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

const requestQueue = new RequestQueue();

// ─── OPENROUTER CLIENT ───────────────────────────────────────────────────────

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Fixed the model string to the correct OpenRouter model ID
export const GEMINI_MODEL = "google/gemini-2.5-flash-lite";

let openRouterAuthFailed = false;
let lastCheckedRawKey: string | undefined;

function getOpenRouterApiKey(): string | null {
  const raw = process.env.OPENROUTER_API_KEY;
  if (raw !== lastCheckedRawKey) {
    lastCheckedRawKey = raw;
    openRouterAuthFailed = false;
  }
  if (openRouterAuthFailed || !raw) {
    return null;
  }
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (
    !cleaned ||
    cleaned === "undefined" ||
    cleaned === "null" ||
    cleaned.startsWith("your_") ||
    cleaned.startsWith("YOUR_")
  ) {
    return null;
  }
  return cleaned;
}

async function callOpenRouter(
  systemPrompt: string,
  userMessage: string,
  temperature = 0.7
): Promise<string> {
  if (!getOpenRouterApiKey()) {
    throw new OpenRouterError(
      401,
      false,
      false,
      undefined,
      "OpenRouter API key is missing or invalid."
    );
  }

  return requestQueue.enqueue(async () => {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      throw new OpenRouterError(
        401,
        false,
        false,
        undefined,
        "OpenRouter API key is missing or invalid."
      );
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(30000), // 30s — adjust to your needs
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Resume Generator",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
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
      if (response.status === 401 || response.status === 403) {
        openRouterAuthFailed = true;
      }
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
  fit_score: number | null;
  match_level: "High" | "Medium" | "Low";
  top_reasons: string[];
  gap_analysis: string;
  card_color_hex: string;
  is_fallback?: boolean;
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
  return "#7C7AAC"; // Stitch Primary Brand Accent for Low/Fallback
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
      industry: null,
      job_category: null,
      work_setup: null,
      location: null,
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
    industry: typeof data.industry === "string" ? data.industry : null,
    job_category: typeof data.job_category === "string" ? data.job_category : null,
    work_setup: typeof data.work_setup === "string" ? data.work_setup : null,
    location: typeof data.location === "string" ? data.location : null,
  };
}

function normalizeJobFitOutput(raw: unknown, fallbackScore?: number): JobFitAnalysisOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Output is not an object");
  }

  const r = raw as Record<string, unknown>;
  const fitScore =
    typeof fallbackScore === "number" && Number.isFinite(fallbackScore)
      ? clampScore(fallbackScore)
      : typeof r.fit_score === "number" && Number.isFinite(r.fit_score)
        ? clampScore(r.fit_score)
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
  const canonical = computeCanonicalJobMatch({
    resume: toPromptText(resumeData),
    job: jobData,
  });
  const score =
    typeof fallbackScore === "number"
      ? clampScore(fallbackScore)
      : canonical.score;

  const level = resolveMatchLevel(score);

  return {
    fit_score: score,
    match_level: level,
    top_reasons: canonical.top_reasons,
    gap_analysis: canonical.gap_analysis,
    card_color_hex: resolveCardColorHex(level),
  };
}

export async function analyzeJobFit(
  input: JobFitAnalysisInput
): Promise<JobFitAnalysisOutput> {
  if (!getOpenRouterApiKey()) {
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
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`OpenRouter API unavailable in analyzeJobFit, using fallback: ${msg}`);
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

function splitListItems(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of raw.split(/[,;\n|]+/)) {
    const cleaned = part.trim().replace(/^[-*•]+\s*/, "");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(cleaned);
    }
  }
  return items;
}

function normalizeSentence(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function buildDeterministicResumeFallback(
  data: ResumeGenerationInput
): ResumeOutput {
  const summaryText = normalizeSentence(data.summary);

  const experienceBlocks = data.experience
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const experience: ExperienceEntry[] = experienceBlocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const header = lines[0] ?? "";
    const headerParts = header.split("|").map((p) => p.trim()).filter(Boolean);

    const hasStructuredHeader = headerParts.length >= 2;
    const title = hasStructuredHeader ? headerParts[0] : header || "Role";
    const company = hasStructuredHeader ? headerParts[1] : "Experience";
    const dateRange = hasStructuredHeader ? (headerParts[2] ?? "") : "";

    const rawBullets = hasStructuredHeader ? lines.slice(1) : lines.slice(1);
    const bullets = (rawBullets.length > 0 ? rawBullets : hasStructuredHeader ? [] : [header])
      .map((line) => line.replace(/^[-*•]+\s*/, "").trim())
      .filter(Boolean)
      .map(normalizeSentence);

    return {
      title,
      company,
      dateRange,
      bullets: bullets.length > 0 ? bullets : ["Contributed to key team deliverables and daily operations."],
    };
  });

  const educationLines = data.education
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const education: EducationEntry[] = educationLines.map((line) => {
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        degree: parts[0],
        institution: parts[1],
        graduationYear: parts[2] ?? "",
        honors: parts[3] || undefined,
      };
    }
    return {
      degree: line,
      institution: "",
      graduationYear: "",
    };
  });

  return {
    professionalSummary: summaryText,
    experience,
    education,
    skills: splitListItems(data.skills),
    certifications: data.certifications ? splitListItems(data.certifications) : [],
    atsScore: null,
    matchedKeywords: [],
  };
}

export async function generateResumeSectionsWithFallback(
  data: ResumeGenerationInput
): Promise<{ sections: ResumeOutput; model: string | null; usedFallback: boolean }> {
  if (!getOpenRouterApiKey()) {
    return {
      sections: buildDeterministicResumeFallback(data),
      model: null,
      usedFallback: true,
    };
  }

  try {
    const sections = await generateResumeSections(data);
    return {
      sections,
      model: GEMINI_MODEL,
      usedFallback: false,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`OpenRouter API unavailable in generateResumeSectionsWithFallback, using fallback: ${msg}`);
    return {
      sections: buildDeterministicResumeFallback(data),
      model: null,
      usedFallback: true,
    };
  }
}

export function formatResumeSectionsToFields(sections: ResumeOutput) {
  const experience = sections.experience
    .map((entry) => {
      const header = [entry.title, entry.company, entry.dateRange]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" | ");
      const bullets = entry.bullets
        .map((bullet) => bullet.trim())
        .filter(Boolean)
        .map((bullet) => `• ${bullet}`)
        .join("\n");
      return [header, bullets].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const education = sections.education
    .map((entry) =>
      [entry.degree, entry.institution, entry.graduationYear, entry.honors ?? ""]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" | ")
    )
    .filter(Boolean)
    .join("\n");

  return {
    summary: sections.professionalSummary,
    experience,
    education,
    skills: sections.skills.join(", "),
    certifications: sections.certifications.join(", "),
  };
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

// ─── CONTRACT BODY GENERATOR (Gemini) ───────────────────────────────────────
export async function generateContractBody(input: {
  job_title: string;
  location?: string;
  salary?: string | number;
}): Promise<string> {
  // If OpenRouter key not configured, return empty to fall back to static templates
  if (!getOpenRouterApiKey()) {
    return "";
  }

  const systemPrompt = `You are an expert HR legal consultant. Generate clean HTML body content for an employment contract. Dynamically tailor the terms, standard operational duties, and performance expectations based on the target position title: {{job_title}}, the location: {{location}}, and the salary: {{salary}}. Keep the wrapper elements intact so merge tags can append safely.`;

  const userMessage = `
Job Title: ${input.job_title}
Location: ${input.location ?? "(not provided)"}
Salary: ${input.salary ?? "(not provided)"}

Please return a concise HTML fragment (no full document) suitable for inclusion inside a contract 'terms' section. Use plain HTML paragraphs and lists only. Do not include <html>, <head>, or <body> wrappers.
  `.trim();

  try {
    const raw = await callOpenRouter(systemPrompt, userMessage, 0.2);
    return raw.trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`generateContractBody fallback: ${msg}`);
    return "";
  }
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