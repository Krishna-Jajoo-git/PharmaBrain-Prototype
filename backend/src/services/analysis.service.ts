import fs from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import type { AnalysisResult } from "../types/index.js";

const disclaimer = "Informational prototype output only. It may contain errors and must be verified with a qualified healthcare professional. It is not a diagnosis or treatment recommendation.";
const mock = (type: "PRESCRIPTION" | "REPORT"): AnalysisResult => type === "PRESCRIPTION" ? {
  documentType: type,
  summary: "DEMO MODE — Prescription for John Smith (34 years old) issued on 09-11-12 by Dr. Steve Johnson at Medical Centre. Prescribed medications include Betaloc 100mg, Dorzolamidum 10mg, Cimetidine 50mg, and Oxprelol 50mg.",
  medicines: [
    {
      name: "Betaloc 100mg",
      dosage: "1 tablet (100mg)",
      duration: "Twice daily (BID)",
      instructions: "Take 1 tablet twice a day (BID)."
    },
    {
      name: "Dorzolamidum 10mg",
      dosage: "1 tablet (10mg)",
      duration: "Twice daily (BID)",
      instructions: "Take 1 tablet twice a day (BID)."
    },
    {
      name: "Cimetidine 50mg",
      dosage: "2 tablets (50mg each)",
      duration: "Three times daily (TID)",
      instructions: "Take 2 tablets three times a day (TID)."
    },
    {
      name: "Oxprelol 50mg",
      dosage: "1 tablet (50mg)",
      duration: "Once daily (QD)",
      instructions: "Take 1 tablet once a day (QD)."
    }
  ],
  keyFindings: [
    "Patient: John Smith, Age: 34 (Date: 09-11-12)",
    "Prescribing Physician: Dr. Steve Johnson (Medical Centre, 824 14th St, NY)",
    "4 active medications prescribed with specific daily timing (BID, TID, QD)."
  ],
  potentialDiseases: [
    "Hypertension / Cardiovascular management (indicated by Betaloc & Oxprelol beta-blockers)",
    "Glaucoma or Ocular Hypertension (indicated by Dorzolamidum ophthalmic/systemic agent)",
    "Gastric Ulcer / Acid Reflux / GERD (indicated by Cimetidine H2-receptor antagonist)"
  ],
  precautions: [
    "Take medications strictly according to the schedule prescribed by Dr. Steve Johnson.",
    "Do not alter doses without consulting a qualified clinician or pharmacist.",
    "Check with your doctor or pharmacist regarding potential interactions between prescribed agents."
  ],
  questionsForDoctor: [
    "Should Betaloc, Dorzolamidum, Cimetidine, and Oxprelol be taken with food?",
    "Are there any specific side effects or warning signs to monitor while on these medications?"
  ],
  disclaimer
} : {
  documentType: type,
  summary: "DEMO MODE — This sample report summary is generated because Gemini is unavailable. The uploaded values have not been read or medically verified.",
  medicines: [],
  keyFindings: ["Not clearly readable from the uploaded document.", "Ask a qualified healthcare professional to interpret all report values in context."],
  potentialDiseases: [
    "Potential metabolic or endocrine imbalance (consult physician for lab verification)",
    "Evaluation needed for lipid / glycemic risk factors based on test parameters"
  ],
  precautions: ["Do not use this demo output to self-diagnose or change treatment."],
  questionsForDoctor: ["Which report values are important for me?", "Do these findings require follow-up testing or discussion?"],
  disclaimer
};

export async function analyseFile(source: string | Buffer, mimeType: string, type: "PRESCRIPTION" | "REPORT"): Promise<{ result: AnalysisResult; isDemo: boolean }> {
  if (env.mockAi || !env.geminiKey) {
    console.log("Using DEMO MODE: mockAi is true or geminiKey is missing.");
    return { result: mock(type), isDemo: true };
  }

  // 4-Model Fallback Chain for quota & rate-limit resilience
  const defaultChain = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
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
      console.warn(`[PharmaBrain AI Warning] Model ${model} encountered an issue (${error?.status || error?.message || error}). Seamlessly switching to backup model...`);
    }
  }

  console.error("[PharmaBrain AI Error] All Gemini models in fallback chain failed or hit rate limits. Serving fallback demo output to preserve UX.");
  return { result: mock(type), isDemo: true };
}
