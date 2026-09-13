import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { extractTextFromDocument } from "../services/ocr.service.js";
import { put } from "@vercel/blob";
import type { AuthRequest } from "../types/index.js";

const router = Router();
const uploadDir = path.resolve("uploads");
if (!process.env.VERCEL) {
  await fs.mkdir(uploadDir, { recursive: true }).catch(() => undefined);
}

const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);
const localStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) =>
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const storage = process.env.VERCEL ? multer.memoryStorage() : localStorage;
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, allowed.has(file.mimetype)),
});

router.use(requireAuth);

router.post("/upload", upload.single("file"), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({
        success: false,
        message: "Choose a JPG, PNG, or PDF file up to 10 MB.",
      });

    const documentType = z.enum(["PRESCRIPTION", "REPORT"]).parse(req.body.documentType);
    let storedFilename = req.file.filename || `${randomUUID()}-${req.file.originalname}`;
    let filePath = req.file.path || "";

    if (process.env.VERCEL) {
      if (process.env.BLOB_READ_WRITE_TOKEN && req.file.buffer) {
        const blob = await put(`pharmabrain/${randomUUID()}-${req.file.originalname}`, req.file.buffer, {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        storedFilename = blob.pathname;
        filePath = blob.url;
      } else if (req.file.buffer) {
        const base64 = req.file.buffer.toString("base64");
        filePath = `data:${req.file.mimetype};base64,${base64}`;
        storedFilename = `${randomUUID()}-${req.file.originalname}`;
      }
    }

    const document = await prisma.document.create({
      data: {
        userId: req.user!.userId,
        originalName: req.file.originalname,
        storedFilename,
        documentType,
        mimeType: req.file.mimetype,
        filePath,
      },
    });

    return res.status(201).json({ success: true, data: document });
  } catch (e) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => undefined);
    next(e);
  }
});

router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.user!.userId },
      include: { analysis: true },
      orderBy: { uploadedAt: "desc" },
    });
    res.json({ success: true, data: documents });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthRequest, res, next) => {
  try {
    const document = await prisma.document.findFirst({
      where: { id: Number(req.params.id), userId: req.user!.userId },
      include: { analysis: true },
    });
    if (!document)
      return res.status(404).json({ success: false, message: "Document not found." });
    res.json({ success: true, data: document });
  } catch (e) {
    next(e);
  }
});

/**
 * OCR text extraction handler.
 * Takes the uploaded document, sends it to the OCR service,
 * extracts all readable text, and saves it to the database.
 * Pure OCR text extraction without LLM/diagnosis.
 */
async function handleOcrExtraction(req: AuthRequest, res: any, next: any) {
  try {
    const document = await prisma.document.findFirst({
      where: { id: Number(req.params.id), userId: req.user!.userId },
      include: { analysis: true },
    });

    if (!document)
      return res.status(404).json({ success: false, message: "Document not found." });

    if (document.analysis) {
      return res.json({
        success: true,
        data: {
          document,
          analysis: document.analysis,
          ocr: document.analysis.structuredResult,
        },
      });
    }

    await prisma.document.update({
      where: { id: document.id },
      data: { status: "ANALYSING" },
    });

    // 1. Run isolated OCR extraction service
    const ocrResult = await extractTextFromDocument(document.filePath, document.mimeType);

    // 2. Persist extracted text in database
    const analysis = await prisma.analysis.create({
      data: {
        documentId: document.id,
        summary: ocrResult.rawText,
        structuredResult: ocrResult as any,
        isDemo: false,
      },
    });

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { status: "ANALYSED" },
    });

    return res.json({
      success: true,
      data: {
        document: updated,
        analysis,
        ocr: ocrResult,
      },
    });
  } catch (e) {
    const id = Number(req.params.id);
    if (id) {
      await prisma.document.updateMany({
        where: { id, userId: req.user!.userId },
        data: { status: "FAILED" },
      });
    }
    next(e);
  }
}

// Dedicated OCR routes
router.post("/:id/ocr", handleOcrExtraction);
router.post("/:id/analyse", handleOcrExtraction);

router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    const document = await prisma.document.findFirst({
      where: { id: Number(req.params.id), userId: req.user!.userId },
    });
    if (!document)
      return res.status(404).json({ success: false, message: "Document not found." });

    await prisma.document.delete({ where: { id: document.id } });
    await fs.unlink(document.filePath).catch(() => undefined);
    res.json({ success: true, message: "Document deleted." });
  } catch (e) {
    next(e);
  }
});

export default router;
