import { extractTextFromDocument } from "./src/services/ocr.service.js";
import path from "node:path";

async function main() {
  const imgPath = path.resolve("../test_prescription.png");
  console.log("Testing OCR on:", imgPath);
  const res = await extractTextFromDocument(imgPath, "image/png");
  console.log("=== OCR RESULT ===");
  console.log("Raw Text:\n" + res.rawText);
  console.log("Confidence:", res.confidence + "%");
  console.log("Words Count:", res.wordsCount);
  console.log("Lines Count:", res.linesCount);
  console.log("Engine:", res.engine);
  console.log("Processing Time:", res.processingTimeMs + "ms");
  console.log("Image Quality:", JSON.stringify(res.quality, null, 2));
  console.log("Structured Regions (" + (res.regions?.length || 0) + "):");
  for (const r of res.regions || []) {
    console.log(`  - [${r.type}] "${r.text}" (conf: ${r.confidence}, needsReview: ${r.needsReview})`);
  }
}

main().catch(console.error);
