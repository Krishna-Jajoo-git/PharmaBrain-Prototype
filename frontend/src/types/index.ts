export type DocumentType = "PRESCRIPTION" | "REPORT";
export type DocumentStatus = "UPLOADED" | "ANALYSING" | "ANALYSED" | "FAILED";

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface OcrResult {
  rawText: string;
  confidence?: number;
  wordsCount: number;
  linesCount: number;
  lines?: string[];
  engine?: string;
}

export interface AnalysisResult {
  documentType?: DocumentType;
  summary?: string;
  medicines?: {
    name: string;
    dosage: string;
    duration: string;
    instructions: string;
  }[];
  keyFindings?: string[];
  precautions?: string[];
  questionsForDoctor?: string[];
  disclaimer?: string;
}

export interface Analysis {
  id: number;
  summary: string;
  structuredResult: OcrResult | AnalysisResult | any;
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
