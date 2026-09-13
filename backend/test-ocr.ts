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
  console.log("Lines Array:", res.lines);
}

main().catch(console.error);
