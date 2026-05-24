import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_MODEL = "google/gemini-2.0-flash-001";

type ApplicationRow = {
  id: string;
  candidate_id: string;
  resume_id: string | null;
  job_posting_id: string;
};

type JobRow = {
  title: string;
  description: string;
  requirements: string | null;
  required_skills: string[] | null;
  work_setup: string | null;
  min_experience: number | null;
};

type ResumeRow = {
  title: string | null;
  content_text: string | null;
  input_data: Record<string, unknown> | null;
  generated_content: Record<string, unknown> | null;
  total_years_experience: number | null;
};

type ProfileRow = {
  work_setup: string | null;
};

type MatchScoreRow = {
  applicant_id: string;
  job_id: string;
  score_total: number;
  score_skills: number | null;
  score_title: number | null;
  score_experience: number | null;
  score_education: number | null;
  score_setup: number | null;
  reasons: string[] | null;
  computed_at: string | null;
};

type ScoreBreakdown = {
  score_skills: number;
  score_title: number;
  score_experience: number;
  score_education: number;
  score_setup: number;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "because",
  "as",
  "until",
  "while",
  "about",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "also",
  "etc",
  "e.g",
  "i.e",
  "per",
  "via",
]);

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSetup(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function collectStrings(value: unknown, bucket: string[], depth = 0): void {
  if (depth > 4 || value == null) return;

  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized) bucket.push(normalized);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, bucket, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, bucket, depth + 1);
    }
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function extractUniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

function joinUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function extractResumeText(resume: ResumeRow): string {
  const pieces: string[] = [];
  collectStrings(resume.content_text, pieces);
  collectStrings(resume.title, pieces);
  collectStrings(resume.input_data, pieces);
  collectStrings(resume.generated_content, pieces);
  return pieces.join("\n");
}

function extractResumeHeadline(resume: ResumeRow): string {
  const headlineCandidates = [
    resume.title,
    getNestedString(resume.generated_content, ["professionalSummary"]),
    getNestedString(resume.input_data, ["extracted_raw", "rawSummary"]),
    getNestedString(resume.input_data, ["rawSummary"]),
    resume.content_text?.split(/\n+/).find((line) => line.trim().length > 0) ?? null,
  ];

  return normalizeText(headlineCandidates.find((candidate) => candidate && candidate.trim().length > 0) ?? "");
}

function extractExperienceTitles(resume: ResumeRow): string[] {
  const titles: string[] = [];

  const generatedExperience = getNestedString(resume.generated_content, ["ai_sections", "experience"]);
  if (generatedExperience) {
    titles.push(generatedExperience);
  }

  const structuredExperience = getNestedString(resume.input_data, ["extracted_raw", "rawExperience"]);
  if (structuredExperience) {
    titles.push(structuredExperience);
  }

  if (resume.content_text) {
    for (const line of resume.content_text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/\bat\b/i.test(trimmed) || /^[-•*]/.test(trimmed)) {
        titles.push(trimmed.replace(/^[-•*]\s*/, ""));
      }
    }
  }

  if (resume.title) {
    titles.unshift(resume.title);
  }

  return joinUnique(titles).slice(0, 8);
}

function extractCandidateSetup(profile: ProfileRow | null): string | null {
  return normalizeSetup(profile?.work_setup ?? null);
}

function estimateYearsFromText(text: string): number | null {
  const explicitMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi))
    .map((match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (explicitMatches.length > 0) {
    return Math.round(Math.max(...explicitMatches));
  }

  const yearRanges = Array.from(text.matchAll(/(?:19|20)\d{2}\s*(?:-|to|–|—)\s*(?:present|current|(?:19|20)\d{2})/gi));
  if (yearRanges.length > 0) {
    let estimatedYears = 0;
    for (const range of yearRanges) {
      const years = range[0].match(/(?:19|20)\d{2}/g);
      if (!years || years.length < 2) continue;
      const startYear = Number.parseInt(years[0], 10);
      const endYear = /present|current/i.test(range[0]) ? new Date().getFullYear() : Number.parseInt(years[1], 10);
      if (Number.isFinite(startYear) && Number.isFinite(endYear) && endYear >= startYear) {
        estimatedYears += Math.max(0, endYear - startYear);
      }
    }

    if (estimatedYears > 0) {
      return estimatedYears;
    }
  }

  return null;
}

function parseTotalYearsExperience(resume: ResumeRow): number | null {
  if (typeof resume.total_years_experience === "number" && Number.isFinite(resume.total_years_experience)) {
    return Math.max(0, resume.total_years_experience);
  }

  const rawExperience =
    getNestedString(resume.input_data, ["rawExperience"]) ??
    getNestedString(resume.input_data, ["extracted_raw", "rawExperience"]) ??
    getNestedString(resume.generated_content, ["ai_sections", "experience"]) ??
    resume.content_text ??
    "";

  return estimateYearsFromText(rawExperience);
}

function localSkillConfidence(requiredSkills: string[], resumeText: string): number {
  if (requiredSkills.length === 0) return 0;

  const resumeTokens = extractUniqueTokens(resumeText);
  let weightedMatches = 0;
  let totalWeight = 0;

  for (const skill of requiredSkills) {
    const skillTokens = tokenize(skill);
    if (skillTokens.length === 0) continue;

    const weight = Math.max(1, skillTokens.length);
    totalWeight += weight;

    const matches = skillTokens.filter((token) => resumeTokens.has(token)).length;
    weightedMatches += weight * (matches / skillTokens.length);
  }

  if (totalWeight === 0) return 0;
  return clampScore((weightedMatches / totalWeight) * 100);
}

async function fetchGeminiInteger(prompt: string): Promise<number | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Resume Generator",
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: "system", content: "Return only the requested integer. No markdown, no commentary." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
    const match = raw.match(/-?\d+/);
    if (!match) return null;

    return clampScore(Number.parseInt(match[0], 10));
  } catch {
    return null;
  }
}

function buildTitleFallbackScore(jobTitle: string, resumeHeadline: string, experienceTitles: string[]): number {
  const jobTokens = extractUniqueTokens(jobTitle);
  const resumeTokens = new Set([
    ...tokenize(resumeHeadline),
    ...experienceTitles.flatMap((title) => tokenize(title)),
  ]);

  if (jobTokens.size === 0 || resumeTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of jobTokens) {
    if (resumeTokens.has(token)) {
      matches++;
    }
  }

  return clampScore((matches / jobTokens.size) * 100);
}

function detectDegreeLevel(text: string): string | null {
  const normalized = text.toLowerCase();

  if (/\b(ph\.?d\.?|doctorate|doctor of philosophy)\b/i.test(normalized)) return "phd";
  if (/\b(master|m\.?s\.?|m\.?a\.?|mba|msc|meng)\b/i.test(normalized)) return "master";
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?|bs\b|ba\b|bsc|beng)\b/i.test(normalized)) return "bachelor";
  if (/\b(associate|a\.?s\.?|aa\b|aas\b)\b/i.test(normalized)) return "associate";

  return null;
}

const FIELD_KEYWORDS = [
  "engineering",
  "computer science",
  "software",
  "information technology",
  "it",
  "data science",
  "statistics",
  "business",
  "marketing",
  "finance",
  "accounting",
  "human resources",
  "hr",
  "management",
  "nursing",
  "medicine",
  "healthcare",
  "education",
  "psychology",
  "design",
];

function extractFieldKeywords(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const matches = new Set<string>();
  for (const keyword of FIELD_KEYWORDS) {
    if (lowered.includes(keyword)) {
      matches.add(keyword);
    }
  }
  return matches;
}

function calculateEducationScore(job: JobRow, resumeText: string): number {
  const jobText = [job.title, job.description, job.requirements ?? "", ...(job.required_skills ?? [])].join(" ");
  const resumeDegree = detectDegreeLevel(resumeText);
  const jobDegree = detectDegreeLevel(jobText);
  const resumeFields = extractFieldKeywords(resumeText);
  const jobFields = extractFieldKeywords(jobText);

  if (!resumeDegree || !jobDegree) {
    return 0;
  }

  const sharedField = [...resumeFields].some((field) => jobFields.has(field));
  if (resumeDegree === jobDegree && sharedField) {
    return 100;
  }

  const degreeHierarchy = ["associate", "bachelor", "master", "phd"];
  const resumeIndex = degreeHierarchy.indexOf(resumeDegree);
  const jobIndex = degreeHierarchy.indexOf(jobDegree);

  if (resumeIndex >= 0 && jobIndex >= 0 && Math.abs(resumeIndex - jobIndex) <= 1 && (sharedField || resumeDegree === jobDegree)) {
    return 60;
  }

  return 0;
}

function calculateWorkSetupScore(jobSetup: string | null, candidateSetup: string | null): number {
  if (!jobSetup || !candidateSetup) {
    return 50;
  }

  return normalizeSetup(jobSetup) === normalizeSetup(candidateSetup) ? 100 : 0;
}

function buildReasons(params: {
  skills: number;
  title: number;
  experience: number;
  education: number;
  setup: number;
  usedGeminiForSkills: boolean;
  usedGeminiForTitle: boolean;
  confidence: number;
  yearsOfExperience: number | null;
  minExperience: number;
  requiredSkills: string[];
  candidateSetup: string | null;
  jobSetup: string | null;
}): string[] {
  const reasons = [
    params.requiredSkills.length > 0
      ? `Skills: ${params.skills}% with ${params.confidence}% local confidence from ${params.requiredSkills.length} required skills${params.usedGeminiForSkills ? "; Gemini confirmed semantic fit" : ""}.`
      : "Skills: no required skills were provided, so this factor scored conservatively.",
    `Title: ${params.title}% based on the job title and resume headline${params.usedGeminiForTitle ? " via Gemini" : ""}.`,
    params.yearsOfExperience === null
      ? `Experience: ${params.experience}% because no reliable years-of-experience value could be parsed.`
      : `Experience: ${params.experience}% with ${params.yearsOfExperience} years against a ${params.minExperience}-year minimum.`,
    `Education: ${params.education}% from degree and field alignment.`,
    params.jobSetup || params.candidateSetup
      ? `Work setup: ${params.setup}% from ${params.jobSetup ?? "unknown"} vs ${params.candidateSetup ?? "unknown"}.`
      : `Work setup: ${params.setup}% because one or both setup values were missing.`,
  ];

  return reasons;
}

function toMatchScoreResponse(row: MatchScoreRow) {
  return {
    success: true,
    score: row.score_total,
    sub_scores: {
      skills: row.score_skills ?? 0,
      title: row.score_title ?? 0,
      experience: row.score_experience ?? 0,
      education: row.score_education ?? 0,
      setup: row.score_setup ?? 0,
    },
    reasons: row.reasons ?? [],
    computed_at: row.computed_at,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { application_id?: string; force?: boolean };
  const applicationId = typeof body.application_id === "string" ? body.application_id.trim() : "";
  const forceRecompute = body.force === true;

  if (!applicationId) {
    return NextResponse.json({ error: "application_id is required" }, { status: 400 });
  }

  const admin = getAdminClient();

  try {
    const { data: application, error: applicationError } = await admin
      .from("applications")
      .select("id, candidate_id, resume_id, job_posting_id")
      .eq("id", applicationId)
      .maybeSingle<ApplicationRow>();

    if (applicationError) {
      throw applicationError;
    }

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const { data: job, error: jobError } = await admin
      .from("job_postings")
      .select("title, description, requirements, required_skills, work_setup, min_experience")
      .eq("id", application.job_posting_id)
      .maybeSingle<JobRow>();

    if (jobError) {
      throw jobError;
    }

    if (!job) {
      return NextResponse.json({ error: "Job posting not found" }, { status: 404 });
    }

    const { data: resume, error: resumeError } = await admin
      .from("resumes")
      .select("title, content_text, input_data, generated_content, total_years_experience")
      .eq("id", application.resume_id)
      .maybeSingle<ResumeRow>();

    if (resumeError) {
      throw resumeError;
    }

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("work_setup")
      .eq("id", application.candidate_id)
      .maybeSingle<ProfileRow>();

    if (profileError) {
      throw profileError;
    }

    const { data: cachedRow, error: cacheError } = await admin
      .from("match_scores")
      .select("applicant_id, job_id, score_total, score_skills, score_title, score_experience, score_education, score_setup, reasons, computed_at")
      .eq("applicant_id", application.candidate_id)
      .eq("job_id", application.job_posting_id)
      .maybeSingle<MatchScoreRow>();

    if (cacheError) {
      throw cacheError;
    }

    const cachedAt = cachedRow?.computed_at ? new Date(cachedRow.computed_at).getTime() : 0;
    const isFreshCache = !!cachedRow && Number.isFinite(cachedAt) && Date.now() - cachedAt < 24 * 60 * 60 * 1000;

    if (!forceRecompute && isFreshCache) {
      await admin
        .from("applications")
        .update({ match_score: cachedRow.score_total, updated_at: new Date().toISOString() })
        .eq("id", application.id);

      return NextResponse.json(toMatchScoreResponse(cachedRow), { status: 200 });
    }

    const requiredSkills = Array.isArray(job.required_skills)
      ? job.required_skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0)
      : [];

    const resumeText = extractResumeText(resume);
    const resumeHeadline = extractResumeHeadline(resume);
    const experienceTitles = extractExperienceTitles(resume);
    const yearsOfExperience = parseTotalYearsExperience(resume);
    const candidateSetup = extractCandidateSetup(profile ?? null);
    const localConfidence = localSkillConfidence(requiredSkills, resumeText);

    let skillScore = localConfidence;
    let usedGeminiForSkills = false;

    if (requiredSkills.length > 0 && localConfidence < 80) {
      const prompt = [
        `Given these required skills: [${requiredSkills.join(", ")}]`,
        `And this resume text:`,
        resumeText.slice(0, 12000),
        `Rate the skills match from 0 to 100 as a single integer. Reply with only the number.`,
      ].join("\n");

      const geminiSkillScore = await fetchGeminiInteger(prompt);
      if (geminiSkillScore !== null) {
        skillScore = geminiSkillScore;
        usedGeminiForSkills = true;
      }
    }

    const titlePrompt = [
      `Job title: ${job.title}`,
      `Resume headline and experience titles: ${[resumeHeadline, ...experienceTitles].filter(Boolean).join(" | ") || "Not available"}`,
      `Rate how well this candidate's background matches the job title from 0 to 100. Reply with only the number.`,
    ].join("\n");

    const fallbackTitleScore = buildTitleFallbackScore(job.title, resumeHeadline, experienceTitles);
    const geminiTitleScore = await fetchGeminiInteger(titlePrompt);
    const titleScore = geminiTitleScore ?? fallbackTitleScore;
    const usedGeminiForTitle = geminiTitleScore !== null;

    const minExperience = typeof job.min_experience === "number" && Number.isFinite(job.min_experience)
      ? Math.max(0, job.min_experience)
      : 0;
    const yearsValue = typeof yearsOfExperience === "number" && Number.isFinite(yearsOfExperience)
      ? Math.max(0, yearsOfExperience)
      : 0;
    const experienceGap = Math.max(0, minExperience - yearsValue);
    const experienceScore = clampScore(100 - experienceGap * 10);

    const educationScore = calculateEducationScore(job, resumeText);
    const setupScore = calculateWorkSetupScore(job.work_setup, candidateSetup);

    const total = clampScore(
      (skillScore * 0.4) +
      (titleScore * 0.25) +
      (experienceScore * 0.15) +
      (educationScore * 0.1) +
      (setupScore * 0.1)
    );

    const reasons = buildReasons({
      skills: skillScore,
      title: titleScore,
      experience: experienceScore,
      education: educationScore,
      setup: setupScore,
      usedGeminiForSkills,
      usedGeminiForTitle,
      confidence: localConfidence,
      yearsOfExperience,
      minExperience,
      requiredSkills,
      candidateSetup,
      jobSetup: normalizeSetup(job.work_setup),
    });

    const scoreRow = {
      applicant_id: application.candidate_id,
      job_id: application.job_posting_id,
      score_total: total,
      score_skills: skillScore,
      score_title: titleScore,
      score_experience: experienceScore,
      score_education: educationScore,
      score_setup: setupScore,
      reasons,
      computed_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin
      .from("match_scores")
      .upsert(scoreRow, { onConflict: "applicant_id,job_id" });

    if (upsertError) {
      throw upsertError;
    }

    const { error: applicationUpdateError } = await admin
      .from("applications")
      .update({ match_score: total, updated_at: new Date().toISOString() })
      .eq("id", application.id);

    if (applicationUpdateError) {
      throw applicationUpdateError;
    }

    return NextResponse.json(
      {
        success: true,
        score: total,
        sub_scores: {
          skills: skillScore,
          title: titleScore,
          experience: experienceScore,
          education: educationScore,
          setup: setupScore,
        },
        reasons,
        recomputed: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("compute-match-score error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute match score" },
      { status: 500 }
    );
  }
}