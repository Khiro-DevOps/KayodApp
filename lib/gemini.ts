import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

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
