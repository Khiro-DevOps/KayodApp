/**
 * Single Canonical Resume-to-Job Match Scoring Engine
 *
 * Used across:
 * - `/applicant/jobs` (Jobs For You · Top Matches + All Open Roles)
 * - Job Detail Modal & standalone Job Details page
 * - Quick Apply / Application submission (`submitApplication`)
 * - `/hr/applicants` Application Hub + "Recalculate scores" (`recalculateMatchScores`)
 *
 * Weighting & Domain Gate:
 * - 75% core fit (40% required skills + 25% role/title/domain alignment + 10% experience & education)
 * - 25% work-setup & location compatibility (gated by core skill/role alignment)
 * - Domain-Mismatch Gate: When core role family and required skills have near-zero overlap
 *   (e.g., Full-Stack Engineer resume vs. HR & Payroll / Accounting / Digital Marketing),
 *   total score is capped in the 8%–24% band (< 25%) so location/work-setup overlap never
 *   inflates an unrelated role to 34%–48%.
 * - High-Fit Calibration: When required skills, tech stack, and role level strongly align
 *   (e.g., Senior Full-Stack Engineer Next.js & Supabase), scores in the 85%–98% band.
 */

import { getAdminClient } from "@/lib/supabase/admin";

export type RoleDomain =
  | "software_engineering"
  | "devops_cloud"
  | "qa_testing"
  | "data_ai"
  | "product_design"
  | "hr_payroll"
  | "finance_accounting"
  | "marketing_growth"
  | "customer_ops"
  | "general";

export interface CanonicalResumeInput {
  id?: string | null;
  candidate_id?: string | null;
  title?: string | null;
  content_text?: string | null;
  input_data?: Record<string, unknown> | null;
  generated_content?: Record<string, unknown> | null;
  total_years_experience?: number | null;
}

export interface CanonicalJobInput {
  id?: string | null;
  title: string;
  description?: string | null;
  requirements?: string | null;
  required_skills?: string[] | null;
  industry?: string | null;
  job_category?: string | null;
  work_setup?: string | null;
  is_remote?: boolean | null;
  location?: string | null;
  city_id?: string | number | null;
  province_id?: string | number | null;
  min_experience?: number | null;
  employment_type?: string | null;
}

export interface CanonicalCandidateContext {
  city_id?: string | number | null;
  province_id?: string | number | null;
  preferred_work_setup?: string | null;
  location?: string | null;
}

export interface CanonicalMatchInput {
  resume: CanonicalResumeInput | string | null | undefined;
  job: CanonicalJobInput;
  candidate?: CanonicalCandidateContext | null;
  geminiSemanticScore?: number | null;
}

export interface CanonicalMatchSubScores {
  skills: number;
  title: number;
  experience: number;
  education: number;
  setup: number;
}

export interface CanonicalMatchResult {
  score: number;
  match_level: "High" | "Medium" | "Low";
  sub_scores: CanonicalMatchSubScores;
  technical_alignment: number;
  role_fit: number;
  domain_alignment: number;
  resume_domain: RoleDomain;
  job_domain: RoleDomain;
  is_domain_mismatch: boolean;
  matched_skills: string[];
  missing_skills: string[];
  top_reasons: [string, string];
  reasons: string[];
  gap_analysis: string;
  card_color_hex: string;
}

const STOP_WORDS = new Set([
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
  "also", "etc", "e.g", "i.e", "per", "via", "role", "looking", "join",
  "team", "work", "working", "experience", "years", "year", "specialist",
  "officer", "lead", "senior", "junior", "associate", "manager",
]);

/**
 * Domain synonym groups for skill matching.
 * Each canonical skill maps to exact or strongly implied technical equivalents.
 */
const SKILL_SYNONYMS: Record<string, string[]> = {
  "next.js": ["nextjs", "next js", "app router", "nextjs app router"],
  "react": ["reactjs", "react.js", "react hooks", "jsx", "tsx"],
  "typescript": ["ts", "tsx", "typed javascript"],
  "javascript": ["js", "es6", "ecmascript", "nodejs", "node.js", "typescript"],
  "node.js": ["nodejs", "node js", "express", "express.js", "nestjs"],
  "supabase": ["supabase auth", "supabase rls", "row-level security", "row level security", "pgvector"],
  "postgresql": ["postgres", "psql", "pg", "pgvector", "supabase", "relational database", "sql"],
  "sql": ["postgresql", "postgres", "mysql", "bigquery", "mssql", "tsql", "sqlite", "database"],
  "tailwind css": ["tailwind", "tailwindcss"],
  "rest apis": ["rest api", "restful", "restful api", "restful apis", "api routes", "server actions", "rpc", "graphql"],
  "git": ["github", "gitlab", "bitbucket", "version control", "github actions"],
  "zod": ["schema validation", "json schema", "typescript"],
  "aws": ["amazon web services", "ec2", "s3", "ecs", "eks", "lambda", "cloud infrastructure"],
  "terraform": ["infrastructure as code", "iac", "cloudformation", "pulumi"],
  "docker": ["containers", "containerization", "dockerfile", "container"],
  "kubernetes": ["k8s", "helm", "container orchestration", "eks", "gke"],
  "github actions": ["ci/cd", "cicd", "continuous integration", "continuous deployment", "github workflow"],
  "ci/cd": ["cicd", "github actions", "gitlab ci", "jenkins", "deployment pipeline", "automated deployment"],
  "linux": ["ubuntu", "debian", "bash", "shell scripting", "unix"],
  "playwright": ["cypress", "e2e testing", "end-to-end testing", "browser automation", "selenium"],
  "e2e testing": ["end-to-end testing", "playwright", "cypress", "test automation", "automated testing"],
  "api testing": ["postman", "rest api testing", "integration testing", "supertest", "playwright"],
  "test automation": ["automated testing", "playwright", "cypress", "jest", "vitest", "qa automation"],
  "qa": ["quality assurance", "software testing", "regression testing", "test cases", "defect tracking"],
  "python": ["pandas", "numpy", "scipy", "scikit-learn", "fastapi", "pytest", "pydantic"],
  "llm orchestration": ["llm", "large language model", "openai", "gemini", "openrouter", "langchain", "ai pipeline", "prompt engineering"],
  "gemini api": ["gemini", "google gemini", "openrouter", "llm", "generative ai", "ai builder"],
  "pgvector": ["vector database", "embeddings", "rag", "postgresql", "supabase"],
  "data pipelines": ["etl", "data pipeline", "data engineering", "airflow", "data ingestion"],
  "rag & embeddings": ["rag", "embeddings", "retrieval augmented generation", "vector search", "pgvector", "llm"],
  "figma": ["ui design", "ux design", "prototyping", "wireframing", "auto layout", "design tokens"],
  "ui/ux design": ["ui design", "ux design", "product design", "user interface", "user experience", "figma"],
  "design systems": ["design system", "component library", "design tokens", "material 3", "ui library"],
  "prototyping": ["interactive prototyping", "figma", "wireframing", "user flows"],
  "user research": ["usability testing", "user interviews", "ux research", "persona"],
  "wireframing": ["wireframes", "user flows", "mockups", "prototyping", "figma"],
  "mobile pwa": ["pwa", "progressive web app", "responsive design", "mobile-first", "mobile web"],
  "accessibility": ["wcag", "a11y", "aria", "accessible ui"],
  "philippine payroll": ["payroll processing", "semi-monthly payroll", "13th-month pay", "pd 851", "payroll computation"],
  "dole compliance": ["dole", "philippine labor code", "labor compliance", "labor law"],
  "sss philhealth pag-ibig": ["sss", "philhealth", "pag-ibig", "hdmf", "statutory contributions", "statutory remittances"],
  "bir 2316": ["bir", "withholding tax", "alphalist", "form 2316", "1601-c"],
  "hris": ["human resource information system", "hr platform", "hr operations", "201 file"],
  "timekeeping": ["attendance logs", "biometrics", "overtime computation", "leave credits", "dtr"],
  "onboarding": ["pre-employment", "201 file", "new hire onboarding"],
  "employee relations": ["hr generalist", "people operations", "talent acquisition", "human resources"],
  "cpa": ["certified public accountant", "accountancy", "prc cpa"],
  "bir tax compliance": ["bir", "1601-c", "2550q", "ewt", "vat", "withholding tax", "tax returns"],
  "financial reporting": ["financial statements", "monthly close", "balance sheet", "income statement", "pfrs"],
  "pfrs": ["ifrs", "gaap", "philippine financial reporting standards", "accounting standards"],
  "general ledger": ["journal entries", "gl reconciliation", "chart of accounts", "bookkeeping"],
  "payroll reconciliation": ["payroll register", "payroll journal", "statutory payables"],
  "xero / quickbooks": ["xero", "quickbooks", "netsuite", "sap", "erp", "accounting software"],
  "audit": ["external audit", "internal audit", "internal controls", "financial audit"],
  "digital marketing": ["performance marketing", "growth marketing", "paid media", "b2b marketing"],
  "seo": ["search engine optimization", "search console", "keyword research", "organic traffic"],
  "linkedin ads": ["meta ads", "google ads", "paid social", "ppc", "ad campaigns"],
  "google analytics 4": ["ga4", "google analytics", "web analytics", "conversion tracking"],
  "content strategy": ["content marketing", "copywriting", "editorial", "blogging"],
  "b2b growth": ["demand generation", "lead generation", "funnel optimization", "cro"],
  "copywriting": ["landing page copy", "email marketing", "content writing"],
  "lead generation": ["demand generation", "mql", "b2b leads", "hubspot", "crm"],
  "customer success": ["account management", "client success", "customer retention", "qbr"],
  "technical support": ["application support", "l2 support", "helpdesk", "troubleshooting", "ticket escalation"],
  "saas onboarding": ["client onboarding", "implementation specialist", "workspace configuration"],
  "client training": ["user training", "webinars", "help center", "product walkthrough"],
  "sql basics": ["sql", "postgresql", "database queries"],
  "sla management": ["zendesk", "intercom", "jira service desk", "support metrics", "csat"],
};

interface DomainSignature {
  domain: RoleDomain;
  titleKeywords: string[];
  skillKeywords: string[];
  industryTags: string[];
}

const DOMAIN_SIGNATURES: DomainSignature[] = [
  {
    domain: "software_engineering",
    titleKeywords: [
      "full-stack", "full stack", "fullstack", "software engineer", "software developer",
      "frontend", "front-end", "backend", "back-end", "web developer", "react developer",
      "next.js", "node.js", "typescript developer", "application developer",
    ],
    skillKeywords: [
      "next.js", "nextjs", "react", "typescript", "javascript", "node.js", "nodejs",
      "supabase", "postgresql", "tailwind css", "tailwind", "rest apis", "rest api",
      "graphql", "prisma", "zod", "server actions", "app router", "express", "vue", "angular",
    ],
    industryTags: ["full stack developer", "backend developer", "frontend developer", "software engineer"],
  },
  {
    domain: "devops_cloud",
    titleKeywords: [
      "devops", "cloud infrastructure", "site reliability", "sre", "platform engineer",
      "infrastructure engineer", "cloud engineer", "systems administrator", "devsecops",
    ],
    skillKeywords: [
      "terraform", "kubernetes", "k8s", "docker", "aws", "gcp", "azure",
      "github actions", "ci/cd", "prometheus", "grafana", "linux", "ansible", "helm",
    ],
    industryTags: ["devops engineer", "cloud engineer", "sre"],
  },
  {
    domain: "qa_testing",
    titleKeywords: [
      "qa", "quality assurance", "test automation", "automation engineer", "sdet",
      "quality engineer", "software tester", "playwright", "cypress",
    ],
    skillKeywords: [
      "playwright", "cypress", "selenium", "e2e testing", "test automation",
      "api testing", "regression testing", "test cases", "qa",
    ],
    industryTags: ["qa engineer", "quality assurance"],
  },
  {
    domain: "data_ai",
    titleKeywords: [
      "data engineer", "ai engineer", "machine learning", "ml engineer", "data scientist",
      "data pipeline", "ai & data", "llm", "analytics engineer", "data analyst",
    ],
    skillKeywords: [
      "python", "llm orchestration", "gemini api", "pgvector", "data pipelines",
      "rag", "embeddings", "pytorch", "tensorflow", "spark", "airflow", "bigquery",
    ],
    industryTags: ["data engineer", "data scientist", "ai engineer"],
  },
  {
    domain: "product_design",
    titleKeywords: [
      "ui/ux", "ux designer", "ui designer", "product designer", "interaction designer",
      "visual designer", "design system", "graphic designer",
    ],
    skillKeywords: [
      "figma", "ui/ux design", "design systems", "prototyping", "wireframing",
      "user research", "usability testing", "auto layout", "wcag",
    ],
    industryTags: ["product designer", "ui/ux designer", "design"],
  },
  {
    domain: "hr_payroll",
    titleKeywords: [
      "hr", "human resources", "payroll", "people & culture", "talent acquisition",
      "recruiter", "recruitment", "employee relations", "people operations", "comp & ben",
    ],
    skillKeywords: [
      "philippine payroll", "dole compliance", "sss philhealth pag-ibig", "bir 2316",
      "201 file", "employee relations", "labor code", "peme", "remittances", "timekeeping",
    ],
    industryTags: ["hr", "hr specialist", "human resources", "people & culture"],
  },
  {
    domain: "finance_accounting",
    titleKeywords: [
      "accounting", "accountant", "cpa", "tax compliance", "finance", "financial",
      "auditor", "bookkeeper", "controller", "treasury",
    ],
    skillKeywords: [
      "cpa", "bir tax compliance", "pfrs", "general ledger", "financial reporting",
      "payroll reconciliation", "xero", "quickbooks", "1601-c", "2550q", "ewt", "audit",
    ],
    industryTags: ["finance", "accountant", "accounting"],
  },
  {
    domain: "marketing_growth",
    titleKeywords: [
      "marketing", "digital marketing", "growth specialist", "seo", "content strategist",
      "demand generation", "social media", "brand manager", "copywriter",
    ],
    skillKeywords: [
      "digital marketing", "seo", "linkedin ads", "meta ads", "google ads",
      "google analytics 4", "ga4", "content strategy", "b2b growth", "lead generation", "copywriting",
    ],
    industryTags: ["marketing", "digital marketing specialist"],
  },
  {
    domain: "customer_ops",
    titleKeywords: [
      "customer success", "technical support", "customer support", "client operations",
      "account manager", "implementation specialist", "service desk", "client success",
    ],
    skillKeywords: [
      "customer success", "technical support", "saas onboarding", "client training",
      "sla management", "zendesk", "ticket escalation", "l2 support",
    ],
    industryTags: ["operations", "operations manager", "customer success"],
  },
];

/**
 * Cross-domain relatedness matrix (0.0 = completely unrelated, 1.0 = exact same domain).
 * Notice: Technical Engineering domains vs. HR / Accounting / Marketing have 0.0 relatedness.
 */
const DOMAIN_RELATEDNESS: Record<RoleDomain, Partial<Record<RoleDomain, number>>> = {
  software_engineering: {
    software_engineering: 1.0,
    data_ai: 0.72,
    qa_testing: 0.68,
    devops_cloud: 0.65,
    product_design: 0.42,
    customer_ops: 0.25,
    hr_payroll: 0.0,
    finance_accounting: 0.0,
    marketing_growth: 0.0,
  },
  devops_cloud: {
    devops_cloud: 1.0,
    software_engineering: 0.65,
    data_ai: 0.6,
    qa_testing: 0.55,
    customer_ops: 0.25,
    product_design: 0.15,
    hr_payroll: 0.0,
    finance_accounting: 0.0,
    marketing_growth: 0.0,
  },
  qa_testing: {
    qa_testing: 1.0,
    software_engineering: 0.68,
    devops_cloud: 0.55,
    data_ai: 0.45,
    product_design: 0.35,
    customer_ops: 0.35,
    hr_payroll: 0.0,
    finance_accounting: 0.0,
    marketing_growth: 0.0,
  },
  data_ai: {
    data_ai: 1.0,
    software_engineering: 0.72,
    devops_cloud: 0.6,
    qa_testing: 0.45,
    product_design: 0.25,
    customer_ops: 0.2,
    hr_payroll: 0.0,
    finance_accounting: 0.1,
    marketing_growth: 0.1,
  },
  product_design: {
    product_design: 1.0,
    software_engineering: 0.42,
    marketing_growth: 0.4,
    qa_testing: 0.3,
    customer_ops: 0.25,
    data_ai: 0.2,
    devops_cloud: 0.1,
    hr_payroll: 0.0,
    finance_accounting: 0.0,
  },
  hr_payroll: {
    hr_payroll: 1.0,
    finance_accounting: 0.38,
    customer_ops: 0.35,
    marketing_growth: 0.15,
    software_engineering: 0.0,
    devops_cloud: 0.0,
    qa_testing: 0.0,
    data_ai: 0.0,
    product_design: 0.0,
  },
  finance_accounting: {
    finance_accounting: 1.0,
    hr_payroll: 0.38,
    customer_ops: 0.2,
    data_ai: 0.1,
    marketing_growth: 0.1,
    software_engineering: 0.0,
    devops_cloud: 0.0,
    qa_testing: 0.0,
    product_design: 0.0,
  },
  marketing_growth: {
    marketing_growth: 1.0,
    product_design: 0.4,
    customer_ops: 0.35,
    hr_payroll: 0.15,
    finance_accounting: 0.1,
    software_engineering: 0.0,
    devops_cloud: 0.0,
    qa_testing: 0.0,
    data_ai: 0.05,
  },
  customer_ops: {
    customer_ops: 1.0,
    hr_payroll: 0.35,
    marketing_growth: 0.35,
    qa_testing: 0.35,
    software_engineering: 0.22,
    product_design: 0.25,
    devops_cloud: 0.2,
    data_ai: 0.2,
    finance_accounting: 0.2,
  },
  general: {
    general: 0.6,
  },
};

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function collectStrings(value: unknown, bucket: string[], depth = 0): void {
  if (depth > 5 || value == null) return;
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
    for (const [k, entry] of Object.entries(value as Record<string, unknown>)) {
      if (k === "pdf_url" || k === "id" || k === "candidate_id") continue;
      collectStrings(entry, bucket, depth + 1);
    }
  }
}

export function extractResumeFullText(
  resume: CanonicalResumeInput | string | null | undefined
): string {
  if (!resume) return "";
  if (typeof resume === "string") return resume.trim();

  const pieces: string[] = [];
  if (resume.title) pieces.push(resume.title);
  if (resume.content_text) pieces.push(resume.content_text);
  collectStrings(resume.generated_content, pieces);
  collectStrings(resume.input_data, pieces);
  return pieces.join("\n").trim();
}

export function extractResumeSkillsList(
  resume: CanonicalResumeInput | string | null | undefined
): string[] {
  if (!resume || typeof resume === "string") return [];
  const skills: string[] = [];

  const addFromValue = (val: unknown) => {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item.trim()) skills.push(item.trim());
      }
    } else if (typeof val === "string" && val.trim()) {
      for (const part of val.split(/[,;\n|•]+/)) {
        const cleaned = part.trim();
        if (cleaned) skills.push(cleaned);
      }
    }
  };

  if (resume.generated_content && typeof resume.generated_content === "object") {
    addFromValue((resume.generated_content as Record<string, unknown>).skills);
    addFromValue((resume.generated_content as Record<string, unknown>).matchedKeywords);
  }
  if (resume.input_data && typeof resume.input_data === "object") {
    const input = resume.input_data as Record<string, unknown>;
    addFromValue(input.skills);
    addFromValue(input.rawSkills);
    if (input.extracted_raw && typeof input.extracted_raw === "object") {
      addFromValue((input.extracted_raw as Record<string, unknown>).rawSkills);
    }
  }

  return Array.from(new Set(skills));
}

export function extractResumeTitlesAndHeadline(
  resume: CanonicalResumeInput | string | null | undefined,
  fullText: string
): string {
  if (!resume) return "";
  if (typeof resume === "string") {
    return resume.split(/\n+/).slice(0, 6).join(" ");
  }

  const parts: string[] = [];
  if (resume.title) parts.push(resume.title);

  const gen = resume.generated_content as Record<string, unknown> | null | undefined;
  if (gen) {
    if (typeof gen.professionalSummary === "string") parts.push(gen.professionalSummary);
    if (typeof gen.summary === "string") parts.push(gen.summary);
    if (Array.isArray(gen.experience)) {
      for (const exp of gen.experience) {
        if (exp && typeof exp === "object") {
          const title = (exp as Record<string, unknown>).title;
          if (typeof title === "string") parts.push(title);
        }
      }
    }
  }

  const inp = resume.input_data as Record<string, unknown> | null | undefined;
  if (inp) {
    if (typeof inp.summary === "string") parts.push(inp.summary);
    if (typeof inp.rawSummary === "string") parts.push(inp.rawSummary);
    if (typeof inp.experience === "string") {
      parts.push(inp.experience.split(/\n+/).slice(0, 6).join(" "));
    }
  }

  if (parts.length === 0 && fullText) {
    parts.push(fullText.split(/\n+/).slice(0, 6).join(" "));
  }

  return parts.join(" ");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystackLower: string, term: string): boolean {
  const normalizedTerm = term.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedTerm) return false;

  // Short terms (<= 3 chars like "it", "hr", "qa", "js", "ts", "r", "cpa") MUST match on word boundaries
  if (normalizedTerm.length <= 4 && /^[a-z0-9]+$/.test(normalizedTerm)) {
    const regex = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i");
    return regex.test(haystackLower);
  }

  // Terms with special punctuation like next.js, node.js, c++, c#, ci/cd
  if (/[^a-z0-9\s]/.test(normalizedTerm)) {
    if (haystackLower.includes(normalizedTerm)) return true;
    // Also check stripped dot/hyphen form (e.g. "Next.js" vs "Nextjs" or "Next js")
    const dotSpace = normalizedTerm.replace(/[.-]/g, " ");
    const dotRemoved = normalizedTerm.replace(/[.-]/g, "");
    return haystackLower.includes(dotSpace) || haystackLower.includes(dotRemoved);
  }

  const regex = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i");
  return regex.test(haystackLower);
}

/**
 * Classifies a job into its primary RoleDomain using job title, category, industry, and required_skills.
 */
export function classifyJobDomain(job: CanonicalJobInput): RoleDomain {
  const titleLower = (job.title ?? "").toLowerCase();
  const categoryLower = (job.job_category ?? "").toLowerCase();
  const industryLower = (job.industry ?? "").toLowerCase();
  const skillsLower = (job.required_skills ?? []).map((s) => s.toLowerCase()).join(" | ");

  let bestDomain: RoleDomain = "general";
  let bestScore = 0;

  for (const sig of DOMAIN_SIGNATURES) {
    let score = 0;

    for (const kw of sig.titleKeywords) {
      if (containsTerm(titleLower, kw)) {
        score += 6;
      }
      if (categoryLower && containsTerm(categoryLower, kw)) {
        score += 5;
      }
    }

    for (const tag of sig.industryTags) {
      if (categoryLower === tag || industryLower === tag) {
        score += 6;
      }
    }

    for (const sk of sig.skillKeywords) {
      if (containsTerm(skillsLower, sk)) {
        score += 2.5;
      }
      if (containsTerm(titleLower, sk)) {
        score += 3;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDomain = sig.domain;
    }
  }

  return bestScore >= 3 ? bestDomain : "general";
}

/**
 * Classifies a resume into its primary RoleDomain (and secondary domain scores)
 * based on headline/titles, skills, and body text.
 */
export function classifyResumeDomain(
  resume: CanonicalResumeInput | string | null | undefined,
  fullText: string
): { primary: RoleDomain; domainScores: Record<RoleDomain, number> } {
  const headlineAndTitles = extractResumeTitlesAndHeadline(resume, fullText).toLowerCase();
  const explicitSkills = extractResumeSkillsList(resume).join(" | ").toLowerCase();
  const bodyLower = fullText.toLowerCase();

  const domainScores: Record<RoleDomain, number> = {
    software_engineering: 0,
    devops_cloud: 0,
    qa_testing: 0,
    data_ai: 0,
    product_design: 0,
    hr_payroll: 0,
    finance_accounting: 0,
    marketing_growth: 0,
    customer_ops: 0,
    general: 0,
  };

  for (const sig of DOMAIN_SIGNATURES) {
    let score = 0;

    for (const kw of sig.titleKeywords) {
      if (containsTerm(headlineAndTitles, kw)) {
        score += 6;
      } else if (containsTerm(bodyLower, kw)) {
        score += 2;
      }
    }

    for (const sk of sig.skillKeywords) {
      if (explicitSkills && containsTerm(explicitSkills, sk)) {
        score += 3.5;
      } else if (containsTerm(bodyLower, sk)) {
        score += 2;
      }
    }

    domainScores[sig.domain] = score;
  }

  let primary: RoleDomain = "general";
  let maxScore = 0;
  for (const [dom, sc] of Object.entries(domainScores) as Array<[RoleDomain, number]>) {
    if (sc > maxScore) {
      maxScore = sc;
      primary = dom;
    }
  }

  return {
    primary: maxScore >= 4 ? primary : "general",
    domainScores,
  };
}

/**
 * Evaluates a single required skill against resume text & explicit skills list.
 * Returns 1.0 for direct/strong synonym match, 0.5 for partial/related token match, 0.0 for missing.
 */
export function matchSingleSkill(
  resumeLower: string,
  explicitSkillsLower: string,
  skill: string
): number {
  const normalizedSkill = skill.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedSkill) return 0;

  // 1. Direct match in explicit skills or resume text
  if (
    (explicitSkillsLower && containsTerm(explicitSkillsLower, normalizedSkill)) ||
    containsTerm(resumeLower, normalizedSkill)
  ) {
    return 1.0;
  }

  // 2. Synonym group lookup
  const directSynonyms = SKILL_SYNONYMS[normalizedSkill];
  if (directSynonyms) {
    for (const syn of directSynonyms) {
      if (
        (explicitSkillsLower && containsTerm(explicitSkillsLower, syn)) ||
        containsTerm(resumeLower, syn)
      ) {
        return 0.92;
      }
    }
  }

  for (const [canonical, variants] of Object.entries(SKILL_SYNONYMS)) {
    const allForms = [canonical, ...variants];
    if (allForms.includes(normalizedSkill)) {
      if (
        allForms.some(
          (form) =>
            (explicitSkillsLower && containsTerm(explicitSkillsLower, form)) ||
            containsTerm(resumeLower, form)
        )
      ) {
        return 0.9;
      }
    }
  }

  // 3. Multi-word compound skill decomposition (e.g. "Xero / QuickBooks", "RAG & Embeddings", "SSS PhilHealth Pag-IBIG")
  const subParts = normalizedSkill
    .split(/[/,&+]|\band\b/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (subParts.length >= 2) {
    const matchedSubParts = subParts.filter(
      (part) =>
        (explicitSkillsLower && containsTerm(explicitSkillsLower, part)) ||
        containsTerm(resumeLower, part)
    );
    if (matchedSubParts.length > 0) {
      return Math.min(1.0, 0.6 + 0.4 * (matchedSubParts.length / subParts.length));
    }
  }

  // 4. Meaningful token overlap for multi-word skills (strictly excluding generic domain nouns)
  const genericSkillStopWords = new Set([
    ...STOP_WORDS,
    "compliance", "management", "operations", "reporting", "strategy",
    "system", "systems", "testing", "design", "development", "basic",
    "basics", "pipeline", "pipelines", "api", "apis", "philippine",
  ]);
  const tokens = normalizedSkill
    .replace(/[^a-z0-9+#.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !genericSkillStopWords.has(t));

  if (tokens.length >= 2) {
    const matchedTokens = tokens.filter((t) => containsTerm(resumeLower, t));
    if (matchedTokens.length === tokens.length) return 0.85;
    if (matchedTokens.length / tokens.length >= 0.5) return 0.45;
  }

  return 0;
}

function extractSignificantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, "").trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function estimateYearsOfExperience(
  resume: CanonicalResumeInput | string | null | undefined,
  fullText: string
): number | null {
  if (
    resume &&
    typeof resume === "object" &&
    typeof resume.total_years_experience === "number" &&
    Number.isFinite(resume.total_years_experience) &&
    resume.total_years_experience > 0
  ) {
    return resume.total_years_experience;
  }

  const explicitMatches = Array.from(
    fullText.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?/gi)
  )
    .map((m) => Number.parseFloat(m[1]))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= 45);

  const maxExplicit: number | null =
    explicitMatches.length > 0 ? Math.round(Math.max(...explicitMatches)) : null;

  // Also check date ranges like "2020 - Present", "2019 - 2023", "Jan 2021 – Current"
  const yearRanges = Array.from(
    fullText.matchAll(/(?:19|20)\d{2}\s*(?:-|to|–|—)\s*(?:present|current|now|(?:19|20)\d{2})/gi)
  );
  let rangeTotal = 0;
  if (yearRanges.length > 0) {
    const currentYear = Math.min(2026, new Date().getFullYear());
    for (const range of yearRanges) {
      const years = range[0].match(/(?:19|20)\d{2}/g);
      if (!years || years.length === 0) continue;
      const startYear = Number.parseInt(years[0], 10);
      const endYear = /present|current|now/i.test(range[0])
        ? currentYear
        : years.length > 1
          ? Number.parseInt(years[1], 10)
          : currentYear;
      if (Number.isFinite(startYear) && Number.isFinite(endYear) && endYear >= startYear) {
        rangeTotal += Math.max(1, endYear - startYear);
      }
    }
  }

  if (maxExplicit !== null && rangeTotal > 0) {
    return Math.max(maxExplicit, Math.min(20, rangeTotal));
  }
  if (maxExplicit !== null) return maxExplicit;
  if (rangeTotal > 0) return Math.min(20, rangeTotal);

  // Fallback: if resume has multiple experience entries, infer at least 3-5 years
  if (resume && typeof resume === "object") {
    const genExp = (resume.generated_content as Record<string, unknown> | null)?.experience;
    if (Array.isArray(genExp) && genExp.length > 0) {
      return Math.min(8, genExp.length * 2 + 1);
    }
  }

  return null;
}

function estimateRequiredYears(job: CanonicalJobInput): number {
  if (typeof job.min_experience === "number" && Number.isFinite(job.min_experience) && job.min_experience >= 0) {
    return job.min_experience;
  }
  const jobText = `${job.title ?? ""} ${job.requirements ?? ""} ${job.description ?? ""}`;
  const matches = Array.from(jobText.matchAll(/(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)/gi))
    .map((m) => Number.parseInt(m[1], 10))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= 20);
  if (matches.length > 0) {
    return Math.min(...matches);
  }
  if (/\bsenior\b|\blead\b|\bprincipal\b/i.test(job.title)) return 4;
  if (/\bjunior\b|\bentry\b|\bintern\b/i.test(job.title)) return 1;
  return 2;
}

function detectDegreeLevel(text: string): string | null {
  const normalized = text.toLowerCase();
  if (/\b(ph\.?d\.?|doctorate|doctor of philosophy)\b/i.test(normalized)) return "phd";
  if (/\b(master|m\.?s\.?|m\.?a\.?|mba|msc|meng)\b/i.test(normalized)) return "master";
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?|bs\b|ba\b|bsc|beng|b\.s|b\.a|bsit|bscs|bsba|bsa)\b/i.test(normalized)) return "bachelor";
  if (/\b(associate|a\.?s\.?|aa\b|aas\b|diploma)\b/i.test(normalized)) return "associate";
  return null;
}

function computeEducationSubScore(
  resumeFullText: string,
  job: CanonicalJobInput,
  domainAlignment: number
): number {
  const jobText = `${job.title} ${job.requirements ?? ""} ${job.description ?? ""}`;
  const resumeDegree = detectDegreeLevel(resumeFullText);
  const jobDegree = detectDegreeLevel(jobText);

  // Check if job requires specific professional license (e.g., CPA)
  const requiresCpa = /\bcpa\b|certified public accountant/i.test(job.title + " " + (job.requirements ?? ""));
  const hasCpa = /\bcpa\b|certified public accountant/i.test(resumeFullText);
  if (requiresCpa && !hasCpa) {
    return 15;
  }

  const hierarchy = ["associate", "bachelor", "master", "phd"];
  const resumeIdx = resumeDegree ? hierarchy.indexOf(resumeDegree) : 1; // default bachelor equivalent if omitted
  const jobIdx = jobDegree ? hierarchy.indexOf(jobDegree) : 1;

  const degreeRatio = resumeIdx >= jobIdx ? 1.0 : Math.max(0.4, 1 - (jobIdx - resumeIdx) * 0.3);
  const fieldFactor = domainAlignment >= 0.7 ? 1.0 : domainAlignment >= 0.4 ? 0.75 : 0.25;

  return clampScore(degreeRatio * fieldFactor * 100);
}

/**
 * Calculates work setup & location compatibility (0 to 100).
 */
export function computeSetupAndLocationSubScore(
  job: CanonicalJobInput,
  resumeFullText: string,
  candidate?: CanonicalCandidateContext | null
): number {
  const jobSetup = (job.work_setup ?? "").toLowerCase().trim();
  const prefSetup = (candidate?.preferred_work_setup ?? "").toLowerCase().trim();

  let setupFit = 85;
  if (prefSetup && jobSetup) {
    if (prefSetup === jobSetup) {
      setupFit = 100;
    } else if (
      (prefSetup === "remote" && jobSetup === "wfh") ||
      (prefSetup === "wfh" && jobSetup === "remote")
    ) {
      setupFit = 100;
    } else if (jobSetup === "hybrid" || jobSetup === "remote" || jobSetup === "wfh") {
      setupFit = 85;
    } else {
      setupFit = 60;
    }
  } else if (jobSetup === "remote" || jobSetup === "wfh") {
    setupFit = 100;
  } else if (jobSetup === "hybrid") {
    setupFit = 92;
  }

  let locationFit = 80;
  if (jobSetup === "remote" || jobSetup === "wfh" || job.is_remote) {
    locationFit = 100;
  } else if (candidate?.city_id && job.city_id && String(candidate.city_id) === String(job.city_id)) {
    locationFit = 100;
  } else if (
    candidate?.province_id &&
    job.province_id &&
    String(candidate.province_id) === String(job.province_id)
  ) {
    locationFit = 90;
  } else if (job.location) {
    const resumeLower = resumeFullText.toLowerCase();
    const locParts = job.location
      .toLowerCase()
      .split(/[,/()-]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3);
    if (locParts.some((part) => resumeLower.includes(part))) {
      locationFit = 95;
    } else if (!candidate?.city_id && !candidate?.province_id) {
      locationFit = 82;
    } else {
      locationFit = 55;
    }
  }

  return clampScore(setupFit * 0.55 + locationFit * 0.45);
}

/**
 * Compute domain alignment multiplier between resume and job (0.0 to 1.0).
 */
export function computeDomainAlignment(
  resumeDomain: RoleDomain,
  resumeDomainScores: Record<RoleDomain, number>,
  jobDomain: RoleDomain
): number {
  if (jobDomain === "general" || resumeDomain === "general") {
    return 0.65;
  }
  if (resumeDomain === jobDomain) {
    return 1.0;
  }

  const baseRelatedness = DOMAIN_RELATEDNESS[resumeDomain]?.[jobDomain] ?? 0.0;

  // Check if the candidate actually has strong secondary evidence in the job's domain
  const primaryScore = Math.max(1, resumeDomainScores[resumeDomain] ?? 1);
  const targetDomainScore = resumeDomainScores[jobDomain] ?? 0;
  const secondaryRatio = Math.min(1, targetDomainScore / Math.max(8, primaryScore * 0.75));

  return Math.max(baseRelatedness, secondaryRatio * 0.85);
}

function resolveMatchLevel(score: number): "High" | "Medium" | "Low" {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function resolveCardColorHex(score: number): string {
  if (score >= 75) return "#10B981"; // emerald
  if (score >= 50) return "#F59E0B"; // amber
  return "#F43F5E"; // rose
}

/**
 * SINGLE CANONICAL RESUME-TO-JOB MATCH ENGINE
 *
 * Deterministically scores a resume against a job (optionally blending a validated Gemini
 * semantic score within the same domain gate), ensuring:
 * 1. Cross-domain unrelated jobs (e.g., HR & Payroll or Accounting for a Software Engineer)
 *    are capped strictly in the 8%–24% band (< 25%).
 * 2. Strong domain + skill matches (e.g., Senior Full-Stack Engineer Next.js & Supabase
 *    for a Next.js/Supabase Full-Stack resume) score accurately in the 85%–98% band.
 * 3. Partial / adjacent technical roles (e.g., Backend Node.js, QA Playwright TypeScript,
 *    AI & Data Pipeline TypeScript/PostgreSQL, DevOps Docker/PostgreSQL) score accurately
 *    according to actual skill & role overlap.
 */
export function computeCanonicalJobMatch(input: CanonicalMatchInput): CanonicalMatchResult {
  const { resume, job, candidate, geminiSemanticScore } = input;
  const resumeFullText = extractResumeFullText(resume);

  if (!resumeFullText) {
    return {
      score: 0,
      match_level: "Low",
      sub_scores: { skills: 0, title: 0, experience: 0, education: 0, setup: 0 },
      technical_alignment: 0,
      role_fit: 0,
      domain_alignment: 0,
      resume_domain: "general",
      job_domain: classifyJobDomain(job),
      is_domain_mismatch: true,
      matched_skills: [],
      missing_skills: job.required_skills ?? [],
      top_reasons: ["Resume content is empty", "Add skills and experience to calculate match"],
      reasons: ["No resume content was available to evaluate."],
      gap_analysis: "Please complete or upload your resume to compute an accurate match score.",
      card_color_hex: resolveCardColorHex(0),
    };
  }

  const resumeLower = resumeFullText.toLowerCase();
  const explicitSkills = extractResumeSkillsList(resume);
  const explicitSkillsLower = explicitSkills.join(" | ").toLowerCase();
  const headlineAndTitles = extractResumeTitlesAndHeadline(resume, resumeFullText).toLowerCase();

  // 1. Domain Classification & Alignment Gate
  const jobDomain = classifyJobDomain(job);
  const { primary: resumeDomain, domainScores } = classifyResumeDomain(resume, resumeFullText);
  const domainAlignment = computeDomainAlignment(resumeDomain, domainScores, jobDomain);

  // 2. Required Skills Evaluation
  const requiredSkills = (job.required_skills ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  let skillPoints = 0;

  if (requiredSkills.length > 0) {
    for (const skill of requiredSkills) {
      const matchVal = matchSingleSkill(resumeLower, explicitSkillsLower, skill);
      skillPoints += matchVal;
      if (matchVal >= 0.5) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }
  }

  const rawSkillRatio =
    requiredSkills.length > 0 ? skillPoints / requiredSkills.length : domainAlignment * 0.7;

  // Calibrate skill sub-score: high skill overlap (e.g. 6/8 or 8/8 core skills) in matching domain scales cleanly
  let skillSubScore = clampScore(rawSkillRatio * 100);
  if (domainAlignment >= 0.85 && rawSkillRatio >= 0.65) {
    // Boost strong stack matches into 86-98% skill band
    skillSubScore = clampScore(78 + rawSkillRatio * 20);
  }

  // 3. Role & Title Alignment Sub-Score
  const titleTokens = extractSignificantTokens(`${job.title ?? ""} ${job.job_category ?? ""}`);
  let titleTokenMatches = 0;
  for (const token of titleTokens) {
    if (containsTerm(headlineAndTitles, token)) {
      titleTokenMatches += 1.0;
    } else if (containsTerm(resumeLower, token)) {
      titleTokenMatches += 0.65;
    }
  }
  const titleTokenRatio =
    titleTokens.length > 0 ? Math.min(1, titleTokenMatches / titleTokens.length) : 0;

  // Combine title token overlap with domain alignment and requirements keyword overlap
  const reqTokens = extractSignificantTokens(`${job.requirements ?? ""} ${job.description ?? ""}`).slice(0, 60);
  let reqMatches = 0;
  for (const token of reqTokens) {
    if (resumeLower.includes(token)) reqMatches++;
  }
  const reqOverlapRatio = reqTokens.length > 0 ? Math.min(1, reqMatches / Math.max(10, reqTokens.length * 0.55)) : 0;

  let titleSubScore = clampScore(
    (domainAlignment * 0.55 + titleTokenRatio * 0.30 + reqOverlapRatio * 0.15) * 100
  );
  if (domainAlignment === 1.0 && (titleTokenRatio >= 0.45 || rawSkillRatio >= 0.7)) {
    titleSubScore = Math.max(titleSubScore, clampScore(84 + titleTokenRatio * 14));
  }

  // 4. Experience Parity Sub-Score (gated by domain relevance!)
  const candidateYears = estimateYearsOfExperience(resume, resumeFullText);
  const requiredYears = estimateRequiredYears(job);
  let rawExperienceScore = 85;
  if (candidateYears !== null) {
    if (candidateYears >= requiredYears) {
      rawExperienceScore = Math.min(98, 90 + Math.min(8, (candidateYears - requiredYears) * 2));
    } else {
      const gap = requiredYears - candidateYears;
      rawExperienceScore = Math.max(35, 88 - gap * 15);
    }
  } else if (domainAlignment >= 0.8 && rawSkillRatio >= 0.65) {
    rawExperienceScore = 88;
  } else {
    rawExperienceScore = 70;
  }
  // Experience in software engineering does NOT count as 100% experience for HR/Payroll or CPA Accounting
  const experienceSubScore = clampScore(rawExperienceScore * (0.2 + 0.8 * domainAlignment));

  // 5. Education & License Sub-Score
  const educationSubScore = computeEducationSubScore(resumeFullText, job, domainAlignment);

  // 6. Work Setup & Location Sub-Score
  const setupSubScore = computeSetupAndLocationSubScore(job, resumeFullText, candidate);

  // 7. Combine 75% Core Fit (Skills + Role/Title + Experience/Education) + 25% Setup/Location Fit
  // Core Fit (0-100): Skills (55%), Role/Title (30%), Experience & Education (15%)
  let deterministicCoreFit =
    skillSubScore * 0.55 +
    titleSubScore * 0.30 +
    experienceSubScore * 0.10 +
    educationSubScore * 0.05;

  // If Gemini semantic score is available, blend it conservatively, but NEVER allow Gemini to bypass the domain gate
  if (typeof geminiSemanticScore === "number" && Number.isFinite(geminiSemanticScore)) {
    const clampedGemini = clampScore(geminiSemanticScore);
    deterministicCoreFit = deterministicCoreFit * 0.7 + clampedGemini * 0.3;
  }

  // Gate setup/location contribution by core skill/domain alignment so location NEVER inflates an unrelated job
  const coreGateFactor = Math.min(1, Math.max(0.15, (domainAlignment * 0.65) + (rawSkillRatio * 0.35)));
  const effectiveSetupContribution = setupSubScore * coreGateFactor;

  let totalScore =
    deterministicCoreFit * 0.75 +
    effectiveSetupContribution * 0.25;

  // 8. CRITICAL FIX: Role & Domain Alignment Gate
  // If core role/skill overlap is near zero (e.g., Software Engineer vs. HR & Payroll / Accounting / Marketing),
  // cap total score strictly in the 8%–24% band (< 25%).
  const isDomainMismatch =
    (domainAlignment <= 0.15 && rawSkillRatio < 0.25) ||
    (domainAlignment <= 0.25 && rawSkillRatio < 0.15) ||
    (domainAlignment === 0 && rawSkillRatio < 0.35);

  if (isDomainMismatch) {
    // Map cleanly into 8% - 24% based on minor skill/setup signals
    const mismatchRaw =
      8 +
      Math.round(
        rawSkillRatio * 30 +
        domainAlignment * 20 +
        reqOverlapRatio * 8 +
        (setupSubScore / 100) * 4
      );
    totalScore = Math.max(8, Math.min(24, mismatchRaw));
  } else if (domainAlignment < 0.45 && rawSkillRatio < 0.3) {
    // Weakly related cross-functional roles (e.g. Software Engineer vs Customer Success / Operations)
    // Cap below 48% so they don't enter Top Matches (>= 50%) unless the candidate actually has matching skills
    totalScore = Math.min(46, Math.max(18, Math.round(totalScore * 0.72)));
  } else if (domainAlignment >= 0.9 && rawSkillRatio >= 0.75) {
    // High-Fit Calibration: Strong domain + required tech stack alignment -> 85%–98% band
    const calibratedHigh = 86 + Math.round((rawSkillRatio - 0.75) * 40 + (setupSubScore / 100) * 2);
    totalScore = Math.max(Math.round(totalScore), Math.min(98, calibratedHigh));
  } else if (domainAlignment >= 0.85 && rawSkillRatio >= 0.6) {
    // Strong domain match with majority of core skills -> at least 78%–89%
    totalScore = Math.max(Math.round(totalScore), Math.min(92, Math.round(76 + rawSkillRatio * 18)));
  }

  const finalScore = Math.max(1, Math.min(98, Math.round(totalScore)));
  const matchLevel = resolveMatchLevel(finalScore);

  const subScores: CanonicalMatchSubScores = {
    skills: isDomainMismatch ? Math.min(24, skillSubScore) : skillSubScore,
    title: isDomainMismatch ? Math.min(20, titleSubScore) : titleSubScore,
    experience: isDomainMismatch ? Math.min(25, experienceSubScore) : experienceSubScore,
    education: isDomainMismatch ? Math.min(30, educationSubScore) : educationSubScore,
    setup: setupSubScore,
  };

  const roleFit = clampScore(
    subScores.title * 0.45 +
    subScores.experience * 0.25 +
    subScores.education * 0.15 +
    subScores.setup * 0.15
  );

  // Build concise, informative top reasons & breakdown reasons
  const topReason1 =
    matchedSkills.length > 0
      ? `Matches ${matchedSkills.length}/${requiredSkills.length || matchedSkills.length} key skills (${matchedSkills.slice(0, 4).join(", ")})`
      : isDomainMismatch
        ? `Different role domain (${formatDomainLabel(jobDomain)} vs ${formatDomainLabel(resumeDomain)})`
        : "Partial overlap with role requirements and domain scope";

  const topReason2 =
    missingSkills.length === 0 && requiredSkills.length > 0
      ? `Full core tech stack & ${job.work_setup ? job.work_setup.toUpperCase() : "work setup"} alignment`
      : missingSkills.length > 0
        ? `Missing required skills: ${missingSkills.slice(0, 3).join(", ")}`
        : `Role & experience alignment: ${roleFit}%`;

  const detailedReasons: string[] = [
    requiredSkills.length > 0
      ? `Skills (${subScores.skills}%): Matched ${matchedSkills.length} of ${requiredSkills.length} required skills${matchedSkills.length > 0 ? ` (${matchedSkills.join(", ")})` : ""}.`
      : `Skills (${subScores.skills}%): Evaluated against role keywords and domain competencies.`,
    `Role & Domain (${subScores.title}%): ${isDomainMismatch ? `Cross-domain mismatch (${formatDomainLabel(resumeDomain)} resume vs ${formatDomainLabel(jobDomain)} role)` : `Aligned with ${job.title}`}.`,
    `Experience (${subScores.experience}%): ${candidateYears !== null ? `${candidateYears}+ yrs detected` : "Evaluated from work history"} vs ${requiredYears}+ yrs target.`,
    `Education (${subScores.education}%): Degree and specialization alignment.`,
    `Work Setup & Location (${subScores.setup}%): ${job.work_setup ?? "Standard"} setup${job.location ? ` in ${job.location}` : ""}.`,
  ];

  const gapAnalysis =
    finalScore >= 75
      ? missingSkills.length > 0
        ? `Strong fit for ${job.title}; minor gap in ${missingSkills.slice(0, 2).join(", ")}.`
        : `Excellent alignment across required skills, role seniority, and work setup.`
      : finalScore >= 50
        ? `Good foundational fit with ${matchedSkills.slice(0, 3).join(", ") || "transferable skills"}, though ${missingSkills.slice(0, 3).join(", ") || "some domain requirements"} are not prominent.`
        : `Low match: this role targets ${formatDomainLabel(jobDomain)} (${requiredSkills.slice(0, 3).join(", ") || job.title}), which differs from your primary profile.`;

  return {
    score: finalScore,
    match_level: matchLevel,
    sub_scores: subScores,
    technical_alignment: subScores.skills,
    role_fit: roleFit,
    domain_alignment: Math.round(domainAlignment * 100),
    resume_domain: resumeDomain,
    job_domain: jobDomain,
    is_domain_mismatch: isDomainMismatch,
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    top_reasons: [topReason1, topReason2],
    reasons: detailedReasons,
    gap_analysis: gapAnalysis,
    card_color_hex: resolveCardColorHex(finalScore),
  };
}

function formatDomainLabel(domain: RoleDomain): string {
  switch (domain) {
    case "software_engineering":
      return "Software Engineering";
    case "devops_cloud":
      return "DevOps & Cloud";
    case "qa_testing":
      return "QA & Test Automation";
    case "data_ai":
      return "Data & AI Engineering";
    case "product_design":
      return "UI/UX & Product Design";
    case "hr_payroll":
      return "HR & Payroll Operations";
    case "finance_accounting":
      return "Finance & Accounting";
    case "marketing_growth":
      return "Digital Marketing & Growth";
    case "customer_ops":
      return "Customer Success & Support";
    default:
      return "General";
  }
}

/**
 * Persist canonical match breakdown to `match_scores` table (best-effort cache by applicant_id + job_id).
 */
export async function persistCanonicalMatchCache(params: {
  applicantId: string;
  jobId: string;
  result: CanonicalMatchResult;
}): Promise<void> {
  const { applicantId, jobId, result } = params;
  if (!applicantId || !jobId) return;

  try {
    const admin = getAdminClient();
    await admin.from("match_scores").upsert(
      {
        applicant_id: applicantId,
        job_id: jobId,
        score_total: result.score,
        score_skills: result.sub_scores.skills,
        score_title: result.sub_scores.title,
        score_experience: result.sub_scores.experience,
        score_education: result.sub_scores.education,
        score_setup: result.sub_scores.setup,
        reasons: result.reasons,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "applicant_id,job_id" }
    );
  } catch (err) {
    // Non-blocking if match_scores table is absent or RLS-restricted in some test environments
    console.warn("persistCanonicalMatchCache warning:", err);
  }
}

/**
 * Batch-persist canonical match scores for a candidate viewing `/applicant/jobs`.
 */
export async function persistBatchCanonicalMatchCache(
  applicantId: string,
  entries: Array<{ jobId: string; result: CanonicalMatchResult }>
): Promise<void> {
  if (!applicantId || entries.length === 0) return;
  try {
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const rows = entries.map(({ jobId, result }) => ({
      applicant_id: applicantId,
      job_id: jobId,
      score_total: result.score,
      score_skills: result.sub_scores.skills,
      score_title: result.sub_scores.title,
      score_experience: result.sub_scores.experience,
      score_education: result.sub_scores.education,
      score_setup: result.sub_scores.setup,
      reasons: result.reasons,
      computed_at: now,
    }));
    await admin.from("match_scores").upsert(rows, { onConflict: "applicant_id,job_id" });
  } catch (err) {
    console.warn("persistBatchCanonicalMatchCache warning:", err);
  }
}

/**
 * Computes and stores the canonical match score for a `job_applications` row,
 * updating both `job_applications` (`match_score`, `technical_alignment`, `role_fit`)
 * and `match_scores` breakdown table.
 */
export async function computeAndStoreApplicationMatch(
  applicationId: string,
  forceRecompute = false
) {
  void forceRecompute;
  const admin = getAdminClient();

  try {
    const { data: application, error: applicationError } = await admin
      .from("job_applications")
      .select("id, applicant_id, resume_id, job_id")
      .eq("id", applicationId)
      .maybeSingle<{
        id: string;
        applicant_id: string;
        resume_id: string | null;
        job_id: string;
      }>();

    if (applicationError) throw applicationError;
    if (!application) {
      return { success: false, error: "Application not found", status: 404 };
    }

    const { data: job, error: jobError } = await admin
      .from("job_postings")
      .select(
        "id, title, description, requirements, required_skills, industry, job_category, work_setup, location, city_id, province_id, min_experience, employment_type"
      )
      .eq("id", application.job_id)
      .maybeSingle<CanonicalJobInput>();

    if (jobError) throw jobError;
    if (!job) {
      return { success: false, error: "Job posting not found", status: 404 };
    }

    // Fetch specified resume, or fall back to candidate's latest resume
    let resume: CanonicalResumeInput | null = null;
    if (application.resume_id) {
      const { data: rData } = await admin
        .from("resumes")
        .select("*")
        .eq("id", application.resume_id)
        .maybeSingle<CanonicalResumeInput>();
      resume = rData ?? null;
    }

    if (!resume && application.applicant_id) {
      const { data: latestResumes } = await admin
        .from("resumes")
        .select("*")
        .eq("candidate_id", application.applicant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<CanonicalResumeInput[]>();
      resume = latestResumes?.[0] ?? null;
    }

    if (!resume) {
      return { success: false, error: "Resume not found", status: 404 };
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("work_setup, city_id, province_id, city")
      .eq("id", application.applicant_id)
      .maybeSingle<{
        work_setup?: string | null;
        city_id?: string | null;
        province_id?: string | null;
        city?: string | null;
      }>();

    const result = computeCanonicalJobMatch({
      resume,
      job,
      candidate: {
        city_id: profile?.city_id ?? null,
        province_id: profile?.province_id ?? null,
        preferred_work_setup: profile?.work_setup ?? null,
        location: profile?.city ?? null,
      },
    });

    await persistCanonicalMatchCache({
      applicantId: application.applicant_id,
      jobId: application.job_id,
      result,
    });

    const { error: updateError } = await admin
      .from("job_applications")
      .update({
        match_score: result.score,
        technical_alignment: result.technical_alignment,
        role_fit: result.role_fit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.id);

    if (updateError) {
      // Fallback if technical_alignment or role_fit columns don't exist on some schemas
      await admin
        .from("job_applications")
        .update({
          match_score: result.score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);
    }

    return {
      success: true,
      score: result.score,
      sub_scores: result.sub_scores,
      reasons: result.reasons,
      recomputed: true,
    };
  } catch (error) {
    console.error("computeAndStoreApplicationMatch error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to compute match score",
      status: 500,
    };
  }
}

export interface DisplayMatchScoreInput {
  applied: boolean;
  stored?: number | null;
  estimate?: number | null;
}

export interface DisplayMatchScoreResult {
  value: number | null;
  kind: "stored" | "estimate";
}

function normalizeScoreValue(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
  return Math.max(0, Math.min(100, scaled));
}

/**
 * Single match-score selector:
 * - If applied and stored score exists -> returns stored score
 * - Otherwise -> returns canonical estimate score
 */
export function getDisplayMatchScore({
  applied,
  stored,
  estimate,
}: DisplayMatchScoreInput): DisplayMatchScoreResult {
  const normalizedStored = normalizeScoreValue(stored);
  const normalizedEstimate = normalizeScoreValue(estimate);

  if (applied && normalizedStored !== null) {
    return {
      value: normalizedStored,
      kind: "stored",
    };
  }

  return {
    value: normalizedEstimate ?? normalizedStored,
    kind: applied && normalizedStored !== null ? "stored" : "estimate",
  };
}
