import type { Request } from "express";

export interface JwtPayload {
  userId: number;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface Medicine {
  name: string;
  dosage: string;
  duration: string;
  instructions: string;
}

export interface AnalysisResult {
  documentType: "PRESCRIPTION" | "REPORT";
  summary: string;
  medicines: Medicine[];
  keyFindings: string[];
  potentialDiseases: string[];
  precautions: string[];
  questionsForDoctor: string[];
  disclaimer: string;
}
