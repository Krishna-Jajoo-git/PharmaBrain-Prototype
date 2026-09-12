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
  precautions: ["Do not use this demo output to self-diagnose or change treatment."],
  questionsForDoctor: ["Which report values are important for me?", "Do these findings require follow-up testing or discussion?"],
  disclaimer
};

export async function analyseFile(source: string | Buffer, mimeType: string, type: "PRESCRIPTION" | "REPORT"): Promise<{ result: AnalysisResult; isDemo: boolean }> {
  if (env.mockAi || !env.geminiKey) {
    console.log("Using DEMO MODE: mockAi is true or geminiKey is missing.");
    return { result: mock(type), isDemo: true };
  }

  const modelsToTry = Array.from(new Set([env.geminiModel, "gemini-2.0-flash", "gemini-1.5-flash"])).filter(Boolean);
  const data = Buffer.isBuffer(source) ? source : source.startsWith("http")
    ? Buffer.from(await (await fetch(source)).arrayBuffer())
    : await fs.readFile(source);
  const ai = new GoogleGenAI({ apiKey: env.geminiKey });
  const prompt = `You are an AI assistant for a medical document summarisation academic prototype called PharmaBrain. Analyse only clearly visible information in this SAMPLE document. Do not diagnose, prescribe, recommend dosage changes, or invent missing facts. If unclear write exactly: Not clearly readable from the uploaded document. Return JSON only with documentType (${type}), summary, medicines (objects with name,dosage,duration,instructions), keyFindings, precautions, questionsForDoctor, disclaimer. Disclaimer must say informational, may contain errors, and verify with qualified healthcare professional.`;

  for (const model of modelsToTry) {
    try {
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
        precautions: Array.isArray(parsed.precautions) ? parsed.precautions : [],
        questionsForDoctor: Array.isArray(parsed.questionsForDoctor) ? parsed.questionsForDoctor : [],
        disclaimer: parsed.disclaimer || disclaimer
      };
      return { result, isDemo: false };
    } catch (error) {
      console.error(`Gemini analysis failed with model ${model}:`, error);
    }
  }

  console.error("All Gemini models failed. Returning demo mode output.");
  return { result: mock(type), isDemo: true };
}
