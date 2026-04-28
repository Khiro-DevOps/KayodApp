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

  // Skills match (50% weight)
  let skillScore = 0;
  if (job.required_skills && job.required_skills.length > 0) {
    skillScore = skillMatchRatio(resumeText, job.required_skills);
  } else {
    // If no skills listed, redistribute weight to other factors
    skillScore = -1; // sentinel for redistribution
  }

  // Requirements match (30% weight)
  let reqScore = 0;
  if (job.requirements) {
    const reqKeywords = extractKeywords(job.requirements);
    reqScore = overlapRatio(resumeKeywords, reqKeywords);
  }

  // Description match (20% weight)
  const descKeywords = extractKeywords(job.description);
  const descScore = overlapRatio(resumeKeywords, descKeywords);

  // Title bonus: if job title words appear in resume, add a small boost
  const titleKeywords = extractKeywords(job.title);
  const titleBonus = overlapRatio(resumeKeywords, titleKeywords) * 10;

  let score: number;

  if (skillScore === -1) {
    // No skills listed: redistribute to 60% requirements, 40% description
    if (job.requirements) {
      score = reqScore * 60 + descScore * 40;
    } else {
      score = descScore * 100;
    }
  } else if (!job.requirements) {
    // No requirements: 70% skills, 30% description
    score = skillScore * 70 + descScore * 30;
  } else {
    // Standard weighting
    score = skillScore * 50 + reqScore * 30 + descScore * 20;
  }

  // Add title bonus (capped)
  score = Math.min(score + titleBonus, 100);

  // Ensure integer in range
  return Math.max(0, Math.min(100, Math.round(score)));
}