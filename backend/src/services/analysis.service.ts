import fs from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import type { AnalysisResult } from "../types/index.js";

const disclaimer = "Informational prototype output only. It may contain errors and must be verified with a qualified healthcare professional. It is not a diagnosis or treatment recommendation.";

export async function analyseFile(source: string | Buffer, mimeType: string, type: "PRESCRIPTION" | "REPORT"): Promise<{ result: AnalysisResult; isDemo: boolean }> {
  if (!env.geminiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server. Please provide a valid key in backend/.env.");
  }

  // Fallback Chain for active supported Gemini models
  const defaultChain = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
  const modelsToTry = Array.from(new Set([
    env.geminiModel,
    ...env.fallbackModels,
    ...defaultChain
  ])).filter(Boolean);

  let data: Buffer;
  if (Buffer.isBuffer(source)) {
    data = source;
  } else if (source.startsWith("data:")) {
    const base64Data = source.split(",")[1] || "";
    data = Buffer.from(base64Data, "base64");
  } else if (source.startsWith("http://") || source.startsWith("https://")) {
    data = Buffer.from(await (await fetch(source)).arrayBuffer());
  } else {
    data = await fs.readFile(source);
  }

  const ai = new GoogleGenAI({ apiKey: env.geminiKey });
  const prompt = `You are an expert AI medical assistant for an academic document analysis prototype called PharmaBrain.
Analyze the attached ${type === "PRESCRIPTION" ? "prescription" : "medical lab report"} image or document.
Perform two main tasks:
1. SUMMARIZE: Extract summary, prescribed medicines (with dosage, duration, instructions), key findings, precautions, and questions for doctor.
2. DISEASE PREDICTION & RISK ASSESSMENT: Based on the medicines listed or lab report findings/abnormalities, evaluate and predict potential health conditions, diseases, or clinical risk factors the patient might have or be at risk for.

Important Guidelines:
- Only analyze clearly visible information in the document.
- If information is unreadable, write "Not clearly readable from the uploaded document."
- Keep disease predictions cautious, educational, and framed as potential conditions to discuss with a physician.

Return JSON strictly matching this schema:
{
  "documentType": "${type}",
  "summary": "string",
  "medicines": [{"name": "string", "dosage": "string", "duration": "string", "instructions": "string"}],
  "keyFindings": ["string"],
  "potentialDiseases": ["string (predicted potential diseases or health conditions)"],
  "precautions": ["string"],
  "questionsForDoctor": ["string"],
  "disclaimer": "Informational prototype output only. It may contain errors and must be verified with a qualified healthcare professional. It is not a diagnosis or treatment recommendation."
}`;

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      console.log(`[PharmaBrain AI] Attempting analysis using Gemini model [${i + 1}/${modelsToTry.length}]: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: data.toString("base64") } }] }],
        config: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.text || "{}") as Partial<AnalysisResult>;
      const result: AnalysisResult = {
        documentType: type,
        summary: parsed.summary || "Not clearly readable from the uploaded document.",
        medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
        potentialDiseases: Array.isArray(parsed.potentialDiseases) ? parsed.potentialDiseases : [],
        precautions: Array.isArray(parsed.precautions) ? parsed.precautions : [],
        questionsForDoctor: Array.isArray(parsed.questionsForDoctor) ? parsed.questionsForDoctor : [],
        disclaimer: parsed.disclaimer || disclaimer
      };
      console.log(`[PharmaBrain AI] Successfully completed document analysis using model: ${model}`);
      return { result, isDemo: false };
    } catch (error: any) {
      lastError = error;
      console.warn(`[PharmaBrain AI Warning] Model ${model} encountered an issue (${error?.status || error?.message || error}). Switching to backup model...`);
    }
  }

  throw new Error(`Gemini document analysis failed across all models (${modelsToTry.join(", ")}): ${lastError?.message || lastError}`);
}
