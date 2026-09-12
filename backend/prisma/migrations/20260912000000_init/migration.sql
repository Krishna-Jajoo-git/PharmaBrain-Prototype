-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "DocumentType" AS ENUM ('PRESCRIPTION', 'REPORT');
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'ANALYSING', 'ANALYSED', 'FAILED');

CREATE TABLE "User" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "documentType" "DocumentType" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Analysis" (
  "id" SERIAL NOT NULL,
  "documentId" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "structuredResult" JSONB NOT NULL,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Document_userId_idx" ON "Document"("userId");
CREATE UNIQUE INDEX "Analysis_documentId_key" ON "Analysis"("documentId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
