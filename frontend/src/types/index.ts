export type DocumentType = "PRESCRIPTION" | "REPORT";
export type DocumentStatus = "UPLOADED" | "ANALYSING" | "ANALYSED" | "FAILED";

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface Medicine {
  name: string;
  dosage: string;
  duration: string;
  instructions: string;
}

export interface AnalysisResult {
  documentType: DocumentType;
  summary: string;
  medicines: Medicine[];
  keyFindings: string[];
  potentialDiseases?: string[];
  precautions: string[];
  questionsForDoctor: string[];
  disclaimer: string;
}

export interface Analysis {
  id: number;
  summary: string;
  structuredResult: AnalysisResult;
  isDemo: boolean;
  createdAt: string;
}

export interface Document {
  id: number;
  originalName: string;
  documentType: DocumentType;
  mimeType: string;
  status: DocumentStatus;
  uploadedAt: string;
  analysis?: Analysis | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

