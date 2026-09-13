export type DocumentType = "PRESCRIPTION" | "REPORT";
export type DocumentStatus = "UPLOADED" | "ANALYSING" | "ANALYSED" | "FAILED";

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface ImageQualityInfo {
  blurScore: number;
  contrastScore: number;
  skewAngle: number;
  isBlurry: boolean;
  isLowContrast: boolean;
  qualityWarnings: string[];
}

export interface OcrRegion {
  text: string;
  confidence: number;          // 0.0 – 1.0
  isLowConfidence: boolean;
  needsReview: boolean;
  boundingBox: [number, number, number, number] | null;
  type: "text_block" | "table_cell" | "table" | "full_page";
  tableInfo: {
    row: number;
    col: number;
    totalRows: number;
    totalCols: number;
  } | null;
}

export interface OcrResult {
  rawText: string;
  text?: string;
  confidence?: number;
  wordsCount: number;
  linesCount: number;
  lines?: string[];
  engine?: string;
  regions?: OcrRegion[];
  quality?: ImageQualityInfo;
  hasLowConfidenceRegions?: boolean;
  processingTimeMs?: number;
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
