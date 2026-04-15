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
  const prompt = `You are a professional HR resume writer. Rewrite and structure the candidate information below into concise, ATS-friendly sections.

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
${data.certifications ?? ""}

Return only valid JSON in this format:
{
  "professional_summary": "2-4 sentence summary",
  "experience_points": ["bullet 1", "bullet 2"],
  "education_points": ["bullet 1", "bullet 2"],
  "skills": ["skill1", "skill2"],
  "certifications": ["cert1", "cert2"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const raw = response.text?.trim() ?? "";
  let clean = raw;

  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const fallback: ResumeGenerationOutput = {
    professional_summary: data.summary,
    experience_points: data.experience
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    education_points: data.education
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    skills: data.skills
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    certifications: (data.certifications ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };

  try {
    const parsed = JSON.parse(clean) as Partial<ResumeGenerationOutput>;
    return {
      professional_summary: parsed.professional_summary?.trim() || fallback.professional_summary,
      experience_points:
        parsed.experience_points?.map((value) => value.trim()).filter(Boolean) || fallback.experience_points,
      education_points:
        parsed.education_points?.map((value) => value.trim()).filter(Boolean) || fallback.education_points,
      skills: parsed.skills?.map((value) => value.trim()).filter(Boolean) || fallback.skills,
      certifications:
        parsed.certifications?.map((value) => value.trim()).filter(Boolean) || fallback.certifications,
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
    model: "gemini-2.0-flash",
    contents: prompt,
  });

  const text = response.text?.trim() || "";

  // Parse JSON from response, handling potential markdown fences
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
    // If JSON parsing fails, return the raw text as the tailored resume
    return {
      tailoredResume: text,
      keywords: [],
    };
  }
}
