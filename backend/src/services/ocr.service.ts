import fs from "node:fs/promises";
import Tesseract from "tesseract.js";
import { PDFParse } from "pdf-parse";
import type { OcrResult } from "../types/index.js";

/**
 * Clean, isolated OCR service.
 * Extracts raw readable text from uploaded images (JPEG, PNG, WebP) and documents (PDF).
 * NO LLM, NO diagnosis, NO medicine extraction.
 */
export async function extractTextFromDocument(
  source: string | Buffer,
  mimeType: string
): Promise<OcrResult> {
  // 1. Resolve source to Buffer
  let buffer: Buffer;
  if (Buffer.isBuffer(source)) {
    buffer = source;
  } else if (source.startsWith("data:")) {
    const base64Data = source.split(",")[1] || "";
    buffer = Buffer.from(base64Data, "base64");
  } else if (source.startsWith("http://") || source.startsWith("https://")) {
    const resp = await fetch(source);
    buffer = Buffer.from(await resp.arrayBuffer());
  } else {
    buffer = await fs.readFile(source);
  }

  // 2. Handle PDF files
  if (mimeType === "application/pdf") {
    try {
      const parser = new PDFParse(buffer as any);
      const textResult = await parser.getText();
      const text = (textResult?.text || "").trim();
      const lines: string[] = text
        ? text.split("\n").map((l: string) => l.trim()).filter(Boolean)
        : [];
      const words: string[] = text ? text.split(/\s+/).filter(Boolean) : [];

      return {
        rawText: text || "[No readable text found in PDF document.]",
        confidence: text ? 100 : 0,
        wordsCount: words.length,
        linesCount: lines.length,
        lines,
        engine: "PDF Text Extractor",
      };
    } catch (err) {
      console.error("PDF text extraction error:", err);
      return {
        rawText: "[Failed to extract text from PDF document.]",
        confidence: 0,
        wordsCount: 0,
        linesCount: 0,
        lines: [],
        engine: "PDF Text Extractor",
      };
    }
  }

  // 3. Handle Image files via Tesseract OCR
  try {
    const result = await Tesseract.recognize(buffer, "eng");
    const rawText = (result.data.text || "").trim();
    const lines: string[] = rawText
      ? rawText.split("\n").map((l: string) => l.trim()).filter(Boolean)
      : [];
    const words: string[] = rawText ? rawText.split(/\s+/).filter(Boolean) : [];
    const confidence = Math.round(result.data.confidence || 0);

    return {
      rawText: rawText || "[No readable text detected in the image.]",
      confidence,
      wordsCount: words.length,
      linesCount: lines.length,
      lines,
      engine: "Tesseract OCR Engine",
    };
  } catch (err) {
    console.error("Tesseract OCR extraction error:", err);
    return {
      rawText: "[OCR processing failed on the uploaded image.]",
      confidence: 0,
      wordsCount: 0,
      linesCount: 0,
      lines: [],
      engine: "Tesseract OCR Engine",
    };
  }
}
