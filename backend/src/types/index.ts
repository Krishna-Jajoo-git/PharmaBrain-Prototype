import type { Request } from "express";
export interface JwtPayload { userId: number; email: string }
export interface AuthRequest extends Request { user?: JwtPayload }
export interface AnalysisResult {
  documentType: "PRESCRIPTION" | "REPORT";
  summary: string;
  medicines: Array<{ name: string; dosage: string; duration: string; instructions: string }>;
  keyFindings: string[];
  precautions: string[];
  questionsForDoctor: string[];
  disclaimer: string;
}
