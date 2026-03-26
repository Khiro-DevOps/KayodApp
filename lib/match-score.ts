/**
 * Compute a match score (0–100) between a resume and a job listing.
 *
 * Scoring is based on:
 * - Skills match (50%): How many of the job's listed skills appear in the resume
 * - Requirements match (30%): Keyword overlap between resume and job requirements
 * - Description match (20%): Keyword overlap between resume and job description
 */

interface JobData {
  title: string;
  description: string;
  requirements: string | null;
  skills: string[] | null;
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
 * Check if a multi-word skill appears in the resume text.
 */
function skillMatchRatio(resumeText: string, skills: string[]): number {
  if (skills.length === 0) return 0;
  const lowerResume = resumeText.toLowerCase();
  let matches = 0;
  for (const skill of skills) {
    if (lowerResume.includes(skill.toLowerCase())) {
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
  if (job.skills && job.skills.length > 0) {
    skillScore = skillMatchRatio(resumeText, job.skills);
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
