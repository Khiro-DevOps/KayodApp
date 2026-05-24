/**
 * Compute a match score (0–100) between a resume and a job listing.
 *
 * Scoring is based on:
 * - Skills match (50%): Fuzzy match of job's listed skills against resume
 * - Requirements match (30%): Keyword overlap between resume and job requirements
 * - Description match (20%): Keyword overlap between resume and job description
 */

interface JobData {
  title: string;
  description: string;
  requirements: string | null;
  required_skills: string[] | null;
}

/**
 * Extracts meaningful words from text, filtering out common stop words.
 */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need", "must",
    "it", "its", "this", "that", "these", "those", "i", "me", "my",
    "we", "our", "you", "your", "he", "she", "they", "them", "their",
    "what", "which", "who", "whom", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "not", "only", "same", "so", "than", "too",
    "very", "just", "because", "as", "until", "while", "about", "between",
    "through", "during", "before", "after", "above", "below", "up", "down",
    "out", "off", "over", "under", "again", "further", "then", "once",
    "also", "etc", "e.g", "i.e", "per", "via",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word))
  );
}

/**
 * Compute overlap ratio between two sets of keywords.
 * Returns a value between 0 and 1.
 */
function overlapRatio(source: Set<string>, target: Set<string>): number {
  if (target.size === 0) return 0;
  let matches = 0;
  for (const word of target) {
    if (source.has(word)) {
      matches++;
    }
  }
  return matches / target.size;
}

/**
 * Synonym map: each key is a canonical skill name, and its value is a list
 * of alternate forms, abbreviations, or related terms that should count as a match.
 *
 * Extend this map to improve matching for your specific domain.
 */
const SKILL_SYNONYMS: Record<string, string[]> = {
  "sql":                ["postgresql", "mysql", "bigquery", "mssql", "tsql", "nosql", "sqlite", "redshift"],
  "python":             ["pandas", "numpy", "scipy", "scikit-learn", "sklearn"],
  "machine learning":   ["ml", "scikit-learn", "sklearn", "predictive modeling", "predictive modelling", "scikit"],
  "deep learning":      ["neural network", "neural networks", "tensorflow", "pytorch", "keras"],
  "power bi":           ["powerbi", "power-bi", "microsoft bi"],
  "tableau":            ["tableau desktop", "tableau server"],
  "looker":             ["looker studio", "google looker"],
  "etl":                ["etl pipelines", "etl pipeline", "data pipeline", "data pipelines", "data ingestion"],
  "a/b testing":        ["ab testing", "a/b test", "split testing", "experimentation"],
  "statistics":         ["statistical", "regression", "regression analysis", "statistical modeling", "statistical modelling"],
  "cloud":              ["aws", "gcp", "azure", "bigquery", "redshift", "snowflake"],
  "data visualization": ["dataviz", "data viz", "visualization", "visualisation", "dashboard", "dashboards"],
  "excel":              ["microsoft excel", "spreadsheet", "spreadsheets", "google sheets"],
  "r":                  ["rstudio", "tidyverse", "ggplot", "dplyr"],
  "spark":              ["apache spark", "pyspark"],
  "airflow":            ["apache airflow", "workflow orchestration"],
  "git":                ["github", "gitlab", "version control", "bitbucket"],
  "java":               ["jvm", "spring boot", "spring"],
  "javascript":         ["js", "typescript", "node.js", "nodejs", "react", "vue"],
};

/**
 * Normalizes a skill string for consistent comparison.
 * Lowercases, trims, and collapses whitespace.
 */
function normalizeSkill(skill: string): string {
  return skill.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Checks whether a single skill appears in the resume text using fuzzy logic:
 *
 * 1. Exact substring match (fastest path).
 * 2. Synonym/alias lookup — if the skill or any of its synonyms appear in the resume.
 * 3. Partial word match — for multi-word skills, considers it a match if at least
 *    60% of the meaningful words in the skill appear somewhere in the resume.
 *    This catches cases like "machine learning engineer" matching "machine learning".
 */
function fuzzySkillMatch(resumeLower: string, skill: string): boolean {
  const normalizedSkill = normalizeSkill(skill);

  // 1. Exact substring match
  if (resumeLower.includes(normalizedSkill)) return true;

  // 2. Synonym lookup
  for (const [canonical, variants] of Object.entries(SKILL_SYNONYMS)) {
    const allForms = [canonical, ...variants];

    // Check if the job skill matches this synonym group
    if (allForms.includes(normalizedSkill)) {
      // Check if any form of the synonym group appears in the resume
      if (allForms.some((form) => resumeLower.includes(form))) return true;
    }
  }

  // 3. Partial word match for multi-word skills (≥2 words)
  const stopWords = new Set(["and", "or", "the", "a", "an", "in", "of", "for", "with"]);
  const parts = normalizedSkill
    .split(/\s+/)
    .filter((p) => p.length > 3 && !stopWords.has(p));

  if (parts.length >= 2) {
    const matchedParts = parts.filter((p) => resumeLower.includes(p));
    if (matchedParts.length / parts.length >= 0.6) return true;
  }

  return false;
}

/**
 * Computes the skill match ratio using fuzzy matching.
 * Returns a value between 0 and 1.
 *
 * Replaces the original `skillMatchRatio` which used exact substring matching only.
 */
function skillMatchRatio(resumeText: string, skills: string[]): number {
  if (skills.length === 0) return 0;
  const resumeLower = resumeText.toLowerCase();
  let matches = 0;
  for (const skill of skills) {
    if (fuzzySkillMatch(resumeLower, skill)) {
      matches++;
    }
  }
  return matches / skills.length;
}

function detectDegreeLevel(text: string): string | null {
  const normalized = text.toLowerCase();

  if (/\b(ph\.?d\.?|doctorate|doctor of philosophy)\b/i.test(normalized)) return "phd";
  if (/\b(master|m\.?s\.?|m\.?a\.?|mba|msc|meng)\b/i.test(normalized)) return "master";
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?|bs\b|ba\b|bsc|beng)\b/i.test(normalized)) return "bachelor";
  if (/\b(associate|a\.?s\.?|aa\b|aas\b)\b/i.test(normalized)) return "associate";

  return null;
}

function extractFieldKeywords(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const keywords = [
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

  return new Set(keywords.filter((keyword) => lowered.includes(keyword)));
}

function extractYearsHint(text: string): number | null {
  const explicitMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi))
    .map((match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (explicitMatches.length > 0) {
    return Math.round(Math.max(...explicitMatches));
  }

  return null;
}

function detectWorkSetup(text: string): string | null {
  const normalized = text.toLowerCase();

  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("remote") || normalized.includes("wfh")) return "remote";
  if (normalized.includes("onsite") || normalized.includes("on-site") || normalized.includes("in office") || normalized.includes("in-office")) return "onsite";

  return null;
}

/**
 * Compute match score between resume text and job data.
 * Returns an integer between 0 and 100.
 */
export function computeMatchScore(
  resumeText: string,
  job: JobData
): number {
  if (!resumeText.trim()) return 0;

  const resumeKeywords = extractKeywords(resumeText);
  const jobText = [job.title, job.description, job.requirements ?? "", ...(job.required_skills ?? [])].join(" ");

  const skillScore = job.required_skills && job.required_skills.length > 0
    ? skillMatchRatio(resumeText, job.required_skills)
    : 0;

  const titleKeywords = extractKeywords(job.title);
  const titleScore = overlapRatio(resumeKeywords, titleKeywords);

  const resumeYears = extractYearsHint(resumeText);
  const jobYears = extractYearsHint(jobText);
  const experienceScore = (() => {
    const candidateYears = resumeYears ?? 0;
    const minimumYears = jobYears ?? 0;
    const gap = Math.max(0, minimumYears - candidateYears);
    return Math.max(0, 1 - gap * 0.1);
  })();

  const resumeDegree = detectDegreeLevel(resumeText);
  const jobDegree = detectDegreeLevel(jobText);
  const resumeFields = extractFieldKeywords(resumeText);
  const jobFields = extractFieldKeywords(jobText);

  const educationScore = (() => {
    if (!resumeDegree || !jobDegree) return 0;
    const sharedField = [...resumeFields].some((field) => jobFields.has(field));
    if (resumeDegree === jobDegree && sharedField) return 1;

    const degreeHierarchy = ["associate", "bachelor", "master", "phd"];
    const resumeIndex = degreeHierarchy.indexOf(resumeDegree);
    const jobIndex = degreeHierarchy.indexOf(jobDegree);
    if (resumeIndex >= 0 && jobIndex >= 0 && Math.abs(resumeIndex - jobIndex) <= 1 && (sharedField || resumeDegree === jobDegree)) {
      return 0.6;
    }

    return 0;
  })();

  const setupScore = (() => {
    const resumeSetup = detectWorkSetup(resumeText);
    const jobSetup = detectWorkSetup(jobText);

    if (!resumeSetup || !jobSetup) return 0.5;
    return resumeSetup === jobSetup ? 1 : 0;
  })();

  const score = (
    skillScore * 40 +
    titleScore * 25 +
    experienceScore * 15 +
    educationScore * 10 +
    setupScore * 10
  ) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculates the compatibility score based on work setup and location.
 */
export function calculateCompatibilityScore(
  workSetup: string | null | undefined,
  jobCityId?: number | string | null,
  jobProvinceId?: number | string | null,
  candidateCityId?: number | string | null,
  candidateProvinceId?: number | string | null,
  candidatePrefWorkSetup?: string | null | undefined
): number {
  // 1. If there is a direct match with the candidate's preferred work setup, perfect compatibility
  if (candidatePrefWorkSetup && workSetup?.toLowerCase() === candidatePrefWorkSetup.toLowerCase()) {
    return 1.0;
  }

  // 2. Remote jobs are generally highly compatible (unless preference explicitly mismatched, which we still want to show but maybe at 1.0 or less? The rules say remote is 1.0 by default)
  if (workSetup?.toLowerCase() === 'remote') {
    return 1.0;
  }
  
  // 3. Location matches
  if (jobCityId && candidateCityId && jobCityId === candidateCityId) {
    return 1.0;
  }
  
  if (jobProvinceId && candidateProvinceId && jobProvinceId === candidateProvinceId) {
    return 0.7;
  }
  
  // Mismatch (e.g., On-site far away)
  return 0.3; 
}

/**
 * Calculates the final weighted match score.
 * 
 * Goal: Ensure that even if location is a mismatch (0.3), a high skill match 
 * (e.g., 95%) still results in a passing score (~75%) so the job remains visible.
 *
 * @param semantic_score - A score from 0-100 (e.g., from Gemini)
 * @param compatibility_score - A score from 0-1 based on location/work setup compatibility
 * @returns The final weighted score
 */
export function calculateWeightedMatchScore(
  semantic_score: number,
  compatibility_score: number
): number {
  // Ensure inputs are within expected ranges
  const clampedSemantic = Math.max(0, Math.min(100, semantic_score));
  const clampedCompatibility = Math.max(0, Math.min(1.0, compatibility_score));

  // Final Score = (semantic_score * 0.7) + (compatibility_score * 30)
  const finalScore = (clampedSemantic * 0.7) + (clampedCompatibility * 30);
  
  // Return rounded to avoid floating point issues
  return Math.round(finalScore);
}