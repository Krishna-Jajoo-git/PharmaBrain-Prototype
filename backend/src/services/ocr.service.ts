import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Tesseract from "tesseract.js";
import { PDFParse } from "pdf-parse";
import type { OcrResult, OcrRegion, ImageQualityInfo } from "../types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Keep the Python sidecar addressable from both tsx (`src/services`) and the
// compiled Node output (`dist/services`). Deployments may override it when the
// sidecar lives outside the application working directory.
const PREPROCESSOR_PY = process.env.OCR_PREPROCESSOR_PATH
  || path.resolve(process.cwd(), "src/ocr/preprocessor.py");
const PREPROCESSED_DIR = path.resolve(__dirname, "../../uploads/_preprocessed");
const PYTHON_TIMEOUT_MS = 30_000; // 30 seconds max for the whole pipeline
const TESSERACT_TIMEOUT_MS = 20_000;
const OCR_CONFIDENCE_LOW_THRESHOLD = 0.65; // Below this → flag for review

/**
 * Clean, isolated OCR service — enhanced multi-stage prescription OCR pipeline.
 *
 * Pipeline:
 *   1. Image Quality Check (blur, contrast, skew)
 *   2. Intelligent Preprocessing (OpenCV, via Python sidecar)
 *   3. Layout & Region Detection (text blocks + table cells)
 *   4. Per-region OCR with Tesseract (PSM tuned per region type)
 *   5. Confidence scoring and low-confidence flagging
 *   6. Post-processing & structured output
 *
 * NO LLM, NO diagnosis, NO medicine extraction.
 */
export async function extractTextFromDocument(
  source: string | Buffer,
  mimeType: string
): Promise<OcrResult> {
  const startTime = Date.now();

  // 1. Resolve source to Buffer
  let buffer: Buffer;
  let sourcePath: string | null = null;

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
    sourcePath = source;
  }

  // 2. Handle PDF files — text extraction (unchanged from original)
  if (mimeType === "application/pdf") {
    return _extractPdf(buffer, Date.now() - startTime);
  }

  // 3. Handle Image files — multi-stage OCR pipeline
  try {
    return await _withTimeout(
      _runImageOcrPipeline(buffer, sourcePath, startTime),
      PYTHON_TIMEOUT_MS
    );
  } catch (err) {
    if ((err as Error)?.message?.includes("timeout")) {
      console.error("OCR pipeline timed out after", PYTHON_TIMEOUT_MS, "ms");
      return _errorResult(
        "[OCR processing timed out. The image may be too large or complex. " +
        "Please try a clearer, smaller image.]",
        "Tesseract OCR Engine (timeout)",
        Date.now() - startTime
      );
    }
    console.error("OCR pipeline error:", err);
    return _errorResult(
      "[OCR processing failed on the uploaded image.]",
      "Tesseract OCR Engine",
      Date.now() - startTime
    );
  }
}

// ---------------------------------------------------------------------------
// Image OCR Pipeline (multi-stage)
// ---------------------------------------------------------------------------

async function _runImageOcrPipeline(
  buffer: Buffer,
  sourcePath: string | null,
  startTime: number
): Promise<OcrResult> {
  // Write buffer to a temp file if we don't already have a path
  let imgPath: string;
  let isTempFile = false;
  if (sourcePath && await _fileExists(sourcePath)) {
    imgPath = sourcePath;
  } else {
    imgPath = path.join(PREPROCESSED_DIR, `_ocr_input_${Date.now()}.png`);
    await fs.mkdir(PREPROCESSED_DIR, { recursive: true });
    await fs.writeFile(imgPath, buffer);
    isTempFile = true;
  }

  try {
    // --- Stage 1 & 2: Quality Assessment + Preprocessing (Python/OpenCV)
    const prepResult = await _runPreprocessor(imgPath, PREPROCESSED_DIR);

    let quality: ImageQualityInfo | undefined;
    let regions: Array<{ bbox: [number, number, number, number]; type: string; tableInfo: any }> = [];
    let imageVariants: Record<string, string | null> = {};

    if (prepResult && !prepResult.error) {
      quality = {
        blurScore:       prepResult.quality.blurScore,
        contrastScore:   prepResult.quality.contrastScore,
        skewAngle:       prepResult.quality.skewAngle,
        isBlurry:        prepResult.quality.isBlurry,
        isLowContrast:   prepResult.quality.isLowContrast,
        qualityWarnings: prepResult.quality.qualityWarnings || [],
      };
      regions = prepResult.regions || [];
      imageVariants = {
        gray: prepResult.grayImagePath || null,
        printed: prepResult.printedImagePath || null,
        handwriting: prepResult.hwImagePath || null,
      };
    } else {
      if (prepResult?.error) {
        console.warn("Preprocessor warning:", prepResult.error);
      }
    }

    // --- Stage 3 & 4: Per-region OCR with Tesseract.js
    // Determine the best image to feed Tesseract
    const ocrSources = await _loadOcrSources(buffer, imageVariants);

    // --- Stage 3 & 4: Per-region OCR with Tesseract worker (accurate cropping)
    const ocrRegions = await _withTimeout(
      _ocrWithWorker(ocrSources, regions),
      TESSERACT_TIMEOUT_MS
    );

    // --- Stage 5: Assemble structured output
    const { rawText, lines, wordsCount, linesCount } = _assembleText(ocrRegions);
    const overallConfidence = _computeOverallConfidence(ocrRegions);
    const hasLowConfidence = ocrRegions.some((r) => r.isLowConfidence);

    return {
      rawText:                   rawText || "[No readable text detected in the image.]",
      text:                      rawText || "",
      confidence:                Math.round(overallConfidence * 100),
      wordsCount,
      linesCount,
      lines,
      engine:                    "Tesseract OCR Engine (Enhanced Pipeline)",
      regions:                   ocrRegions,
      quality,
      hasLowConfidenceRegions:   hasLowConfidence,
      processingTimeMs:          Date.now() - startTime,
    };
  } finally {
    if (isTempFile) {
      await fs.unlink(imgPath).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Run Python Preprocessor (with timeout)
// ---------------------------------------------------------------------------

async function _runPreprocessor(imgPath: string, outputDir: string): Promise<any> {
  return new Promise((resolve) => {
    // A deployment may provide an isolated OCR Python environment. Default to
    // the platform interpreter so existing local setups keep working.
    const python = process.env.OCR_PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const proc = spawn(python, [PREPROCESSOR_PY, imgPath, outputDir], {
      timeout: PYTHON_TIMEOUT_MS - 5000, // Reserve 5s for OCR
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code: number) => {
      if (stderr) console.warn("[preprocessor stderr]", stderr.slice(0, 500));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ error: `Preprocessor JSON parse error (exit ${code}): ${stdout.slice(0, 200)}` });
      }
    });

    proc.on("error", (err: Error) => {
      resolve({ error: `Preprocessor spawn error: ${err.message}` });
    });
  });
}

// ---------------------------------------------------------------------------
// OCR Worker Execution
// ---------------------------------------------------------------------------

/**
 * Execute OCR using a single Tesseract worker instance.
 * Supports exact regional cropping via worker.recognize with rectangle coordinates.
 */
async function _ocrWithWorker(
  sources: Record<string, Buffer>,
  regions: Array<{ bbox: [number, number, number, number]; type: string; tableInfo: any }>
): Promise<OcrRegion[]> {
  const worker = await Tesseract.createWorker("eng");
  try {
    if (!regions.length) {
      return [await _recognizeFullPage(worker, sources)];
    }

    const results: OcrRegion[] = [];
    for (const region of regions) {
      const [rx, ry, rw, rh] = region.bbox;
      if (rw < 5 || rh < 5) continue;

      try {
        const candidate = await _recognizeRegion(worker, sources, region);
        const text = candidate.text;
        // Skip tiny empty noise regions
        if (!text && rw * rh < 800) continue;

        const confidence = candidate.confidence;

        results.push({
          text,
          confidence:      Math.round(confidence * 1000) / 1000,
          isLowConfidence: confidence < OCR_CONFIDENCE_LOW_THRESHOLD,
          needsReview:     confidence < OCR_CONFIDENCE_LOW_THRESHOLD,
          boundingBox:     [rx, ry, rw, rh],
          type:            region.type as OcrRegion["type"],
          tableInfo:       region.tableInfo ?? null,
        });
      } catch {
        results.push(_emptyRegion(region.type as OcrRegion["type"], [rx, ry, rw, rh], region.tableInfo));
      }
    }

    // Fallback: If region crops yielded no readable text, run full image scan
    const combined = results.map((r) => r.text).join("").trim();
    if (!combined) {
      const fullPage = await _recognizeFullPage(worker, sources);
      if (fullPage.text) results.push(fullPage);
    }

    return results;
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

type LayoutRegion = { bbox: [number, number, number, number]; type: string; tableInfo: any };
type RecognitionCandidate = { text: string; confidence: number };

/**
 * Try only compatible image variants and retain the observed OCR result with
 * the strongest confidence/legibility score. This is selection, not text
 * correction: low-confidence text remains visibly flagged for confirmation.
 */
async function _recognizeRegion(
  worker: Tesseract.Worker,
  sources: Record<string, Buffer>,
  region: LayoutRegion
): Promise<RecognitionCandidate> {
  const [left, top, width, height] = region.bbox;
  const isTableCell = region.type === "table_cell";
  const names = isTableCell
    ? ["printed", "gray"]
    : ["gray", "printed"];
  const candidates: RecognitionCandidate[] = [];

  for (const name of names) {
    const source = sources[name];
    if (!source) continue;
    await worker.setParameters({
      tessedit_pageseg_mode: _selectPsm(region.type, width, height),
      preserve_interword_spaces: "1",
    });
    const ret = await worker.recognize(source, {
      rectangle: { left, top, width, height },
    });
    candidates.push(_toCandidate(ret.data.text, ret.data.confidence));

    // The first non-empty result is deliberately retained. Retrying every
    // low-confidence crop across several thresholds is slow and can make an
    // uncertain Tesseract reading look falsely authoritative. A dedicated
    // handwriting recognizer can be plugged in separately for such regions.
    if (candidates[candidates.length - 1].text) break;
  }
  return _chooseCandidate(candidates);
}

async function _recognizeFullPage(
  worker: Tesseract.Worker,
  sources: Record<string, Buffer>
): Promise<OcrRegion> {
  const candidates: RecognitionCandidate[] = [];
  for (const name of ["gray", "printed", "handwriting", "original"]) {
    const source = sources[name];
    if (!source) continue;
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO, preserve_interword_spaces: "1" });
    const ret = await worker.recognize(source);
    candidates.push(_toCandidate(ret.data.text, ret.data.confidence));
    if (name === "gray" && candidates[0].confidence >= 0.80 && candidates[0].text) break;
  }
  const chosen = _chooseCandidate(candidates);
  return {
    text: chosen.text,
    confidence: chosen.confidence,
    isLowConfidence: chosen.confidence < OCR_CONFIDENCE_LOW_THRESHOLD,
    needsReview: chosen.confidence < OCR_CONFIDENCE_LOW_THRESHOLD,
    boundingBox: null,
    type: "full_page",
    tableInfo: null,
  };
}

function _toCandidate(text: string, rawConfidence: number): RecognitionCandidate {
  const normalized = Math.max(0, Math.min(1, (rawConfidence || 0) / 100));
  return { text: (text || "").trim(), confidence: normalized };
}

function _chooseCandidate(candidates: RecognitionCandidate[]): RecognitionCandidate {
  if (!candidates.length) return { text: "", confidence: 0 };
  return candidates.reduce((best, candidate) => {
    // Penalise OCR output made mostly of symbols. It remains available only if
    // it was the sole observation, and will be marked as needing review.
    const quality = (value: RecognitionCandidate) => {
      const useful = (value.text.match(/[\p{L}\p{N}]/gu) || []).length;
      const ratio = useful / Math.max(value.text.length, 1);
      return value.confidence * (0.75 + 0.25 * ratio);
    };
    return quality(candidate) > quality(best) ? candidate : best;
  });
}

/**
 * Select the best Tesseract PSM for a given region type and size.
 */
function _selectPsm(type: string, w: number, h: number): Tesseract.PSM {
  if (type === "table_cell") {
    // Single line (or very few lines) expected in table cells
    return h < 60 ? Tesseract.PSM.SINGLE_LINE : Tesseract.PSM.SINGLE_BLOCK;
  }
  if (type === "table") {
    return Tesseract.PSM.SINGLE_BLOCK;
  }
  // For general text blocks, auto-segmentation with orientation detection
  return Tesseract.PSM.SINGLE_BLOCK;
}

/**
 * Assemble regions into a complete raw text string.
 * Table cells are reconstructed in row/column order.
 */
function _assembleText(
  ocrRegions: OcrRegion[],
  _layoutRegions?: Array<{ bbox: [number, number, number, number]; type: string; tableInfo: any }>
): { rawText: string; lines: string[]; wordsCount: number; linesCount: number } {
  // Keep non-table blocks in visual reading order and treat all cells of a
  // table as one ordered entry at the table's page position. The old approach
  // appended every table after all blocks, which could move a footer ahead of
  // its table.
  const tableCells = ocrRegions.filter((r) => r.type === "table_cell" || r.type === "table");
  const textBlocks = ocrRegions.filter((r) => r.type === "text_block" || r.type === "full_page");
  const positioned: Array<{ text: string; x: number; y: number }> = textBlocks
    .filter((block) => block.text)
    .map((block) => ({
      text: block.text,
      x: block.boundingBox?.[0] ?? 0,
      y: block.boundingBox?.[1] ?? 0,
    }));

  if (tableCells.length > 0) {
    const tableText = _reconstructTable(tableCells);
    const firstCell = tableCells.reduce((top, cell) => {
      const topY = top.boundingBox?.[1] ?? Number.MAX_SAFE_INTEGER;
      const cellY = cell.boundingBox?.[1] ?? Number.MAX_SAFE_INTEGER;
      return cellY < topY ? cell : top;
    });
    if (tableText) positioned.push({
      text: tableText,
      x: firstCell.boundingBox?.[0] ?? 0,
      y: firstCell.boundingBox?.[1] ?? 0,
    });
  }

  positioned.sort((a, b) => a.y - b.y || a.x - b.x);
  const rawText = positioned.map((entry) => entry.text).join("\n\n").trim();
  const lines = rawText ? rawText.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const words = rawText ? rawText.split(/\s+/).filter(Boolean) : [];

  return { rawText, lines, wordsCount: words.length, linesCount: lines.length };
}

/**
 * Reconstruct table text preserving row/column relationships.
 * Format: tab-separated columns, newline-separated rows.
 */
function _reconstructTable(tableCells: OcrRegion[]): string {
  // Group by row
  const rowMap = new Map<number, OcrRegion[]>();

  for (const cell of tableCells) {
    const row = cell.tableInfo?.row ?? 0;
    if (!rowMap.has(row)) rowMap.set(row, []);
    rowMap.get(row)!.push(cell);
  }

  const rows: string[] = [];
  const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);

  for (const rowIdx of sortedRows) {
    const cells = rowMap.get(rowIdx)!.sort((a, b) => (a.tableInfo?.col ?? 0) - (b.tableInfo?.col ?? 0));
    const rowText = cells.map((c) => c.text.replace(/\n/g, " ").trim()).join(" | ");
    if (rowText.trim()) rows.push(rowText);
  }

  return rows.join("\n");
}

function _computeOverallConfidence(regions: OcrRegion[]): number {
  if (!regions.length) return 0;
  const valid = regions.filter((r) => r.text.trim());
  if (!valid.length) return 0;
  return valid.reduce((sum, r) => sum + r.confidence, 0) / valid.length;
}

function _emptyRegion(
  type: OcrRegion["type"],
  bbox: [number, number, number, number] | null,
  tableInfo: OcrRegion["tableInfo"]
): OcrRegion {
  return {
    text: "",
    confidence: 0,
    isLowConfidence: true,
    needsReview: true,
    boundingBox: bbox,
    type,
    tableInfo: tableInfo ?? null,
  };
}

// ---------------------------------------------------------------------------
// PDF extraction (unchanged, kept isolated)
// ---------------------------------------------------------------------------

async function _extractPdf(buffer: Buffer, elapsedMs: number): Promise<OcrResult> {
  try {
    const parser = new PDFParse(buffer as any);
    const textResult = await parser.getText();
    const text = (textResult?.text || "").trim();
    const lines = text ? text.split("\n").map((l: string) => l.trim()).filter(Boolean) : [];
    const words = text ? text.split(/\s+/).filter(Boolean) : [];

    const region: OcrRegion = {
      text,
      confidence:       text ? 1.0 : 0.0,
      isLowConfidence:  !text,
      needsReview:      !text,
      boundingBox:      null,
      type:             "full_page",
      tableInfo:        null,
    };

    return {
      rawText:         text || "[No readable text found in PDF document.]",
      text:            text || "",
      confidence:      text ? 100 : 0,
      wordsCount:      words.length,
      linesCount:      lines.length,
      lines,
      engine:          "PDF Text Extractor",
      regions:         [region],
      processingTimeMs: elapsedMs,
    };
  } catch (err) {
    console.error("PDF text extraction error:", err);
    return _errorResult(
      "[Failed to extract text from PDF document.]",
      "PDF Text Extractor",
      elapsedMs
    );
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function _errorResult(msg: string, engine: string, elapsedMs: number): OcrResult {
  return {
    rawText:         msg,
    text:            "",
    confidence:      0,
    wordsCount:      0,
    linesCount:      0,
    lines:           [],
    engine,
    regions:         [],
    processingTimeMs: elapsedMs,
  };
}

async function _loadOcrSources(
  original: Buffer,
  variantPaths: Record<string, string | null>
): Promise<Record<string, Buffer>> {
  const sources: Record<string, Buffer> = { original };
  await Promise.all(Object.entries(variantPaths).map(async ([name, variantPath]) => {
    if (!variantPath) return;
    try {
      const data = await fs.readFile(variantPath);
      if (data.length) sources[name] = data;
    } catch {
      // The original upload remains a safe fallback when a variant was not saved.
    }
  }));
  return sources;
}

async function _fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OCR pipeline timeout (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
