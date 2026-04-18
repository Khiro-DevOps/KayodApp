import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

const model = "gemini-3.1-flash";

/**
 * Service to interface with Gemini for resume content
 */
export async function generateResumeContent(jobTitle: string, rawExperience: string) {
  const prompt = `
    Context: Professional Resume Builder.
    Task: Convert the following raw experience into 3 high-impact bullet points.
    Role: ${jobTitle}
    Experience: ${rawExperience}
    Output Format: Return ONLY a JSON array of strings.
  `;

  try {
    const result = await genAI.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = result.text?.trim() ?? "[]";
    return JSON.parse(responseText);
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw error;
  }
}