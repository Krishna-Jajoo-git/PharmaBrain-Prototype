import path from "node:path";
import fs from "node:fs/promises";
import { extractTextFromDocument } from "../src/services/ocr.service.js";

const BENCHMARK_DIR = path.resolve("uploads/_benchmark");

const SCENARIOS = [
  { file: "1_clear_original.png", label: "1. Clear Printed Prescription" },
  { file: "2_blurry_original.png", label: "2. Blurry / Camera-Captured Prescription" },
  { file: "3_handwritten_original.png", label: "3. Handwritten Prescription" },
  { file: "4_multi_region_original.png", label: "4. Multi-Region Document Layout" },
  { file: "5_table_original.png", label: "5. Table-Like Prescription Layout" },
];

function separator(char = "=", width = 72) {
  console.log(char.repeat(width));
}

async function runBenchmark() {
  console.log("\n");
  separator("=");
  console.log("       PHARMABRAIN FULL OCR PIPELINE BENCHMARK (5 SCENARIOS)        ");
  separator("=");

  for (const s of SCENARIOS) {
    const origPath = path.join(BENCHMARK_DIR, s.file);
    const exists = await fs.access(origPath).then(() => true).catch(() => false);
    if (!exists) {
      console.log(`[SKIP] Missing image: ${origPath}`);
      continue;
    }

    const baseName = s.file.replace(/\.[^/.]+$/, "");
    const preprocessedPath = path.join(
      BENCHMARK_DIR,
      `${baseName}_printed.png`
    );

    console.log(`\nScenario: ${s.label}`);
    separator("-");
    console.log(`Original image:     ${origPath}`);
    console.log(`Preprocessed image: ${preprocessedPath}`);
    separator("-");

    const result = await extractTextFromDocument(origPath, "image/png");

    console.log("Quality Metrics:");
    if (result.quality) {
      console.log(`  Blur score:     ${result.quality.blurScore} (isBlurry: ${result.quality.isBlurry})`);
      console.log(`  Contrast score: ${result.quality.contrastScore} (lowContrast: ${result.quality.isLowContrast})`);
      console.log(`  Skew angle:     ${result.quality.skewAngle}°`);
      if (result.quality.qualityWarnings.length > 0) {
        for (const w of result.quality.qualityWarnings) {
          console.log(`  [!] ${w}`);
        }
      }
    } else {
      console.log("  (Quality assessment not available)");
    }
    separator("-");

    console.log(`Regions detected: ${result.regions?.length || 0}`);
    for (const [idx, r] of (result.regions || []).slice(0, 5).entries()) {
      const tableStr = r.tableInfo ? ` [R${r.tableInfo.row + 1}:C${r.tableInfo.col + 1}]` : "";
      console.log(`  [${idx + 1}] ${r.type}${tableStr}: "${r.text.replace(/\n/g, ' ')}" (conf: ${Math.round(r.confidence * 100)}%${r.needsReview ? ' - NEEDS REVIEW' : ''})`);
    }
    if ((result.regions?.length || 0) > 5) {
      console.log(`  ... and ${(result.regions?.length || 0) - 5} more regions`);
    }
    separator("-");

    console.log("OCR Extracted Text:");
    if (result.rawText) {
      const displayLines = result.rawText.split("\n").slice(0, 8);
      for (const line of displayLines) {
        if (line.trim()) console.log(`  | ${line}`);
      }
      if (result.rawText.split("\n").length > 8) {
        console.log(`  | ... [${result.rawText.split("\n").length - 8} more lines]`);
      }
    } else {
      console.log("  (no text detected)");
    }
    separator("-");

    console.log(`Confidence:      ${result.confidence}%`);
    console.log(`Words Count:     ${result.wordsCount}`);
    console.log(`Lines Count:     ${result.linesCount}`);
    console.log(`Needs Review:    ${result.hasLowConfidenceRegions ? "YES (low confidence regions detected)" : "NO"}`);
    console.log(`Processing Time: ${result.processingTimeMs} ms`);
    separator("=");
  }
}

runBenchmark().catch(console.error);
