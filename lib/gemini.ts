import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface ResumeGenerationInput {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  certifications?: string;
}

interface ResumeGenerationOutput {
  professional_summary: string;
  experience_points: string[];
  education_points: string[];
  skills: string[];
  certifications: string[];
}

export async function generateResumeSections(
  data: ResumeGenerationInput
): Promise<ResumeGenerationOutput> {
  const prompt = `You are a senior HR professional and expert resume writer with 15+ years of experience helping candidates land jobs at top companies.

Your task is to transform the raw candidate information below into a polished, professional, ATS-optimized resume.

IMPORTANT INSTRUCTIONS:
- Rewrite the summary as a compelling 2-4 sentence professional pitch that highlights value and impact
- Transform raw experience notes into strong action-verb bullet points (e.g. "Increased sales by 30% by implementing..."). Add measurable impact where reasonable to infer.
- Rewrite education entries in clean, standard format
- Expand and normalize the skills list — infer related skills if clearly implied (e.g. "React" implies "JavaScript")
- Do NOT fabricate companies, dates, degrees, or certifications not mentioned
- Write in third-person implied style (no "I" or "my")
- Each experience bullet must start with a past-tense action verb

Candidate:
- Name: ${data.fullName}
- Email: ${data.email}
- Phone: ${data.phone}
- Location: ${data.location}

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

Return ONLY valid JSON, no markdown, no explanation:
{
  "professional_summary": "2-4 sentence compelling professional summary",
  "experience_points": [
    "Action verb + task + measurable result or impact"
  ],
  "education_points": ["Degree, Institution, Year"],
  "skills": ["skill1", "skill2"],
  "certifications": ["cert1", "cert2"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  const raw = response.text?.trim() ?? "";
  let clean = raw;
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const fallback: ResumeGenerationOutput = {
    professional_summary: data.summary,
    experience_points: data.experience.split("\n").map(l => l.trim()).filter(Boolean),
    education_points: data.education.split("\n").map(l => l.trim()).filter(Boolean),
    skills: data.skills.split(",").map(s => s.trim()).filter(Boolean),
    certifications: (data.certifications ?? "").split(",").map(s => s.trim()).filter(Boolean),
  };

  try {
    const parsed = JSON.parse(clean) as Partial<ResumeGenerationOutput>;
    return {
      professional_summary: parsed.professional_summary?.trim() || fallback.professional_summary,
      experience_points: parsed.experience_points?.map(s => s.trim()).filter(Boolean) || fallback.experience_points,
      education_points: parsed.education_points?.map(s => s.trim()).filter(Boolean) || fallback.education_points,
      skills: parsed.skills?.map(s => s.trim()).filter(Boolean) || fallback.skills,
      certifications: parsed.certifications?.map(s => s.trim()).filter(Boolean) || fallback.certifications,
    };
  } catch {
    return fallback;
  }
}

export async function tailorResume(
  resumeText: string,
  jobDescription: string
): Promise<{ tailoredResume: string; keywords: string[] }> {
  const prompt = `You are an expert resume writer and career coach. Given the following resume text and job description, produce two things:

1. A tailored version of the resume that highlights relevant experience, skills, and achievements for the specific job. Keep it professional and concise. Rewrite sections as needed to better match the job requirements, but do not fabricate experience.

2. A list of important keywords from the job description that the tailored resume addresses.

Resume Text:
---
${resumeText}
---

Job Description:
---
${jobDescription}
---

Respond in the following JSON format only (no markdown, no code fences):
{
  "tailored_resume": "The full tailored resume text here",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  const text = response.text?.trim() || "";
  let cleanText = text;
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleanText);
    return {
      tailoredResume: parsed.tailored_resume || "",
      keywords: parsed.keywords || [],
    };
  } catch {
    return { tailoredResume: text, keywords: [] };
  }
}