import type { Request } from "express";

export interface JwtPayload {
  userId: number;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
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
  confidence: number;         // 0.0 – 1.0
  isLowConfidence: boolean;
  needsReview: boolean;
  boundingBox: [number, number, number, number] | null; // [x, y, w, h]
  type: "text_block" | "table_cell" | "table" | "full_page";
  tableInfo: {
    row: number;
    col: number;
    totalRows: number;
    totalCols: number;
  } | null;
}

export interface OcrResult {
  /** Full raw extracted text preserving reading order and table rows. */
  rawText: string;
  /** Alias for rawText — used in structured output. */
  text?: string;
  /** Overall Tesseract confidence (0–100, legacy) or normalised 0–1 mean. */
  confidence?: number;
  wordsCount: number;
  linesCount: number;
  lines: string[];
  engine: string;
  /** Per-region structured extraction results with individual confidence. */
  regions?: OcrRegion[];
  /** Image quality diagnostics. */
  quality?: ImageQualityInfo;
  /** Whether any region was flagged as low-confidence and needs user review. */
  hasLowConfidenceRegions?: boolean;
  /** Total OCR processing time in milliseconds. */
  processingTimeMs?: number;
}

export interface AnalysisResult {
  documentType: "PRESCRIPTION" | "REPORT";
  summary: string;
  medicines: Array<{
    name: string;
    dosage: string;
    duration: string;
    instructions: string;
  }>;
  keyFindings: string[];
  precautions: string[];
  questionsForDoctor: string[];
  disclaimer: string;
}
