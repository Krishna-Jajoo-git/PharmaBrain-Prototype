import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  Download,
  FileCode,
  FileText,
  Layers,
  LoaderCircle,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { documentApi } from "../services/api";
import { useToast } from "../components/Toast";

import type {
  Document,
  DocumentType,
  OcrResult,
  OcrRegion,
  AnalysisResult,
} from "../types";

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [docs, setDocs] = useState<Document[]>([]);

  useEffect(() => {
    documentApi
      .list()
      .then((r) => setDocs(r.data.data))
      .catch(() => undefined);
  }, []);

  const stats = [
    [
      "Total Documents",
      docs.length,
    ],
    [
      "Prescriptions",
      docs.filter((d) => d.documentType === "PRESCRIPTION").length,
    ],
    [
      "Reports",
      docs.filter((d) => d.documentType === "REPORT").length,
    ],
    [
      "OCR Extracted",
      docs.filter((d) => d.status === "ANALYSED").length,
    ],
  ];

  return (
    <>
      <p className="text-sm font-semibold text-brand-600">
        Your workspace
      </p>

      <h1 className="mt-1 text-3xl font-bold">
        Welcome back
      </h1>

      <p className="mt-2 text-slate-500">
        Upload a prescription or medical report to extract all readable
        text using OCR.
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([name, val]) => (
          <div className="card p-4" key={String(name)}>
            <p className="text-xs text-slate-500">
              {name}
            </p>

            <p className="mt-1 text-2xl font-bold">
              {val}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-7 rounded-2xl bg-brand-600 p-7 text-white md:flex md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">
            Ready to extract text from a document?
          </h2>

          <p className="mt-2 max-w-xl text-brand-100">
            Upload a prescription or medical report, then run OCR to
            extract all readable text.
          </p>
        </div>

        <div className="mt-5 flex gap-3 md:mt-0">
          <Link
            className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-700 shadow-sm hover:bg-brand-50"
            to="/upload?type=PRESCRIPTION"
          >
            Upload Prescription
          </Link>

          <Link
            className="rounded-xl border border-brand-300 px-4 py-2.5 font-semibold hover:bg-brand-700"
            to="/upload?type=REPORT"
          >
            Upload Report
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold">
          Recent documents
        </h2>

        <div className="card mt-3 divide-y">
          {docs.slice(0, 5).map((d) => (
            <DocumentRow
              key={d.id}
              d={d}
            />
          ))}

          {!docs.length && (
            <p className="p-7 text-center text-sm text-slate-500">
              No documents yet. Your uploads will appear here.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// DocumentRow
// ---------------------------------------------------------------------------

function DocumentRow({
  d,
  onDelete,
}: {
  d: Document;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
        <FileText size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {d.originalName}
        </p>

        <p className="text-xs text-slate-500">
          {d.documentType === "PRESCRIPTION"
            ? "Prescription"
            : "Medical report"}{" "}
          · {new Date(d.uploadedAt).toLocaleDateString()}
        </p>
      </div>

      <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 sm:inline">
        {d.status === "ANALYSED"
          ? "Extracted"
          : d.status}
      </span>

      <Link
        className="text-sm font-semibold text-brand-700 hover:text-brand-800"
        to={d.analysis ? `/documents/${d.id}` : "/upload"}
      >
        {d.analysis
          ? "View Extracted Text"
          : "Extract Text (OCR)"}
      </Link>

      {onDelete && (
        <button
          onClick={onDelete}
          className="p-2 text-slate-400 hover:text-rose-600"
          aria-label="Delete document"
        >
          <Trash2 size={17} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadPage
// ---------------------------------------------------------------------------

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);

  const [type, setType] = useState<DocumentType>(
    new URLSearchParams(window.location.search).get("type") ===
      "REPORT"
      ? "REPORT"
      : "PRESCRIPTION"
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nav = useNavigate();

  const pick = (f?: File) => {
    if (!f) return;

    if (
      ![
        "image/jpeg",
        "image/png",
        "application/pdf",
      ].includes(f.type)
    ) {
      setError("Use a JPG, PNG, or PDF file.");
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      setError("Maximum file size is 10 MB.");
      return;
    }

    setError("");
    setFile(f);
  };

  const go = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // 1. Upload document
      const form = new FormData();

      form.append("file", file);
      form.append("documentType", type);

      const uploaded = await documentApi.upload(form);

      // 2. Run OCR
      await documentApi.ocr(
        uploaded.data.data.id
      );

      // 3. Open extracted text page
      nav(
        `/documents/${uploaded.data.data.id}`
      );
    } catch (error) {
      console.error(error);

      setError(
        "Upload or OCR text extraction failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold">
        Upload document
      </h1>

      <p className="mt-2 text-slate-500">
        Choose a prescription or medical report. Upload the file
        and run OCR to extract all readable text.
      </p>

      <div className="mt-7 card p-6">
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() =>
              setType("PRESCRIPTION")
            }
            className={`rounded-lg py-2 text-sm font-semibold ${
              type === "PRESCRIPTION"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Prescription
          </button>

          <button
            onClick={() =>
              setType("REPORT")
            }
            className={`rounded-lg py-2 text-sm font-semibold ${
              type === "REPORT"
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Medical Report
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <label
          onDragOver={(e) =>
            e.preventDefault()
          }
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-10 text-center transition hover:bg-brand-50"
        >
          <UploadCloud
            className="text-brand-600"
            size={34}
          />

          <p className="mt-3 font-semibold">
            Drag and drop your file here
          </p>

          <p className="mt-1 text-sm text-slate-500">
            JPG, PNG, or PDF · maximum 10 MB
          </p>

          <span className="btn-secondary mt-4 text-sm">
            Choose file
          </span>

          <input
            className="hidden"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            onChange={(e) =>
              pick(e.target.files?.[0])
            }
          />
        </label>

        {file && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div>
              <p className="font-medium">
                {file.name}
              </p>

              <p className="text-xs text-slate-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <button
              onClick={() => setFile(null)}
              className="text-sm font-semibold text-rose-600 hover:text-rose-700"
            >
              Remove
            </button>
          </div>
        )}

        <button
          disabled={busy}
          onClick={go}
          className="btn-primary mt-6 flex w-full items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <LoaderCircle
                className="animate-spin"
                size={18}
              />

              Uploading and extracting readable text via OCR…
            </>
          ) : (
            "Extract Text (OCR)"
          )}
        </button>

        <p className="mt-3 text-center text-xs text-slate-500">
          This step performs pure OCR character extraction.
          No medical interpretation, symptom detection,
          or LLM processing is applied.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentsPage
// ---------------------------------------------------------------------------

export function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);

  const toast = useToast();

  const load = () => {
    documentApi
      .list()
      .then((r) => setDocs(r.data.data))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: number) => {
    if (
      !confirm(
        "Delete this document and its extracted text?"
      )
    ) {
      return;
    }

    try {
      await documentApi.remove(id);

      toast("Document deleted.");

      load();
    } catch {
      toast("Failed to delete document.");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold">
        My Documents
      </h1>

      <p className="mt-2 text-slate-500">
        Only documents uploaded to your account are shown here.
      </p>

      <div className="card mt-7 divide-y">
        {docs.map((d) => (
          <DocumentRow
            key={d.id}
            d={d}
            onDelete={() => remove(d.id)}
          />
        ))}

        {!docs.length && (
          <div className="p-10 text-center">
            <BarChart3
              className="mx-auto text-slate-300"
            />

            <p className="mt-3 text-slate-500">
              No saved documents yet.
            </p>

            <Link
              className="btn-primary mt-4"
              to="/upload"
            >
              Upload a document
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultsPage
// ---------------------------------------------------------------------------

export function ResultsPage() {
  const { id } = useParams();

  const [doc, setDoc] =
    useState<Document | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [ocrBusy, setOcrBusy] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  const [viewMode, setViewMode] =
    useState<"clean" | "lines" | "regions">(
      "clean"
    );

  const toast = useToast();

  const loadDocument = () => {
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    documentApi
      .get(id)
      .then((r) => {
        setDoc(r.data.data);
      })
      .catch(() => {
        setDoc(null);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDocument();
  }, [id]);

  const handleRunOcr = async () => {
    if (!doc) return;

    setOcrBusy(true);

    try {
      await documentApi.ocr(doc.id);

      toast(
        "OCR text extraction completed!"
      );

      loadDocument();
    } catch {
      toast(
        "OCR extraction failed. Please try again."
      );
    } finally {
      setOcrBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <LoaderCircle
          className="animate-spin"
          size={20}
        />

        Loading document…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="card max-w-lg p-8 text-center">
        <p className="font-medium text-slate-600">
          Document not found.
        </p>

        <Link
          to="/documents"
          className="btn-primary mt-4 text-sm"
        >
          Return to documents
        </Link>
      </div>
    );
  }

  const ocr =
    doc.analysis?.structuredResult as
      | OcrResult
      | undefined;

  const rawText =
    ocr?.rawText ||
    doc.analysis?.summary ||
    "";

  const lines =
    ocr?.lines ||
    (rawText
      ? rawText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : []);

  const wordsCount =
    ocr?.wordsCount ??
    (rawText
      ? rawText
          .split(/\s+/)
          .filter(Boolean).length
      : 0);

  const linesCount =
    ocr?.linesCount ?? lines.length;

  const confidence =
    ocr?.confidence ?? 100;

  const regions: OcrRegion[] =
    ocr?.regions || [];

  const quality = ocr?.quality;

  const hasLowConfidence =
    ocr?.hasLowConfidenceRegions ?? false;

  const processingTimeMs =
    ocr?.processingTimeMs;

  const r =
    doc.analysis?.structuredResult as
      | AnalysisResult
      | undefined;

  const handleCopy = async () => {
    if (!rawText) return;

    try {
      await navigator.clipboard.writeText(
        rawText
      );

      setCopied(true);

      toast(
        "Extracted text copied to clipboard!"
      );

      setTimeout(
        () => setCopied(false),
        2000
      );
    } catch {
      toast("Failed to copy text.");
    }
  };

  const handleDownload = () => {
    if (!rawText) return;

    const blob = new Blob([rawText], {
      type: "text/plain;charset=utf-8",
    });

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download = `${doc.originalName.replace(
      /\.[^/.]+$/,
      ""
    )}-extracted-text.txt`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    toast("Extracted text downloaded.");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
        to="/documents"
      >
        ← Back to documents
      </Link>

      {/* Header */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold text-slate-900">
              Extracted Text (OCR)
            </h1>

            <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
              OCR Ready
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {doc.originalName} ·{" "}
            {doc.documentType ===
            "PRESCRIPTION"
              ? "Prescription"
              : "Medical Report"}{" "}
            · Uploaded{" "}
            {new Date(
              doc.uploadedAt
            ).toLocaleDateString()}
          </p>
        </div>

        {rawText && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
            >
              {copied ? (
                <>
                  <Check
                    size={14}
                    className="text-emerald-600"
                  />

                  <span className="text-emerald-600">
                    Copied!
                  </span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
            >
              <Download size={14} />
              <span>Download .txt</span>
            </button>
          </div>
        )}
      </div>

      {/* OCR Metrics */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Words Detected"
          value={String(wordsCount)}
        />

        <MetricCard
          label="Total Lines"
          value={String(linesCount)}
        />

        <div className="card p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            OCR Confidence
          </p>

          <p
            className={`mt-1 text-2xl font-extrabold ${
              confidence >= 65
                ? "text-emerald-600"
                : "text-amber-500"
            }`}
          >
            {confidence > 0
              ? `${confidence}%`
              : "—"}
          </p>
        </div>

        <MetricCard
          label="Processing Time"
          value={
            processingTimeMs != null
              ? `${(
                  processingTimeMs / 1000
                ).toFixed(1)}s`
              : "—"
          }
        />
      </div>

      {/* Quality Warnings */}

      {quality &&
        quality.qualityWarnings.length >
          0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-500"
            />

            <div>
              <p className="text-xs font-bold text-amber-800">
                Image Quality Notes
              </p>

              <ul className="mt-1 space-y-0.5">
                {quality.qualityWarnings.map(
                  (warning, index) => (
                    <li
                      key={index}
                      className="text-xs text-amber-700"
                    >
                      {warning}
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        )}

      {/* Low Confidence */}

      {hasLowConfidence && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-rose-500"
          />

          <div>
            <p className="text-xs font-bold text-rose-800">
              Manual Review Needed
            </p>

            <p className="mt-0.5 text-xs text-rose-700">
              One or more text regions were
              extracted with low confidence.
              These regions are marked in the{" "}
              <strong>
                Regions &amp; Confidence
              </strong>{" "}
              view. Please verify the
              highlighted sections manually.
            </p>
          </div>
        </div>
      )}

      {/* Main Extracted Text */}

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-brand-50 p-1.5 text-brand-600">
              <FileCode size={18} />
            </span>

            <h2 className="font-bold text-slate-900">
              Raw Extracted Text
            </h2>
          </div>

          {rawText && (
            <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                onClick={() =>
                  setViewMode("clean")
                }
                className={`rounded-md px-3 py-1 transition ${
                  viewMode === "clean"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Clean Text
              </button>

              <button
                onClick={() =>
                  setViewMode("lines")
                }
                className={`rounded-md px-3 py-1 transition ${
                  viewMode === "lines"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Lines ({lines.length})
              </button>

              {regions.length > 0 && (
                <button
                  onClick={() =>
                    setViewMode("regions")
                  }
                  className={`flex items-center gap-1 rounded-md px-3 py-1 transition ${
                    viewMode === "regions"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Layers size={11} />

                  Regions ({regions.length})

                  {hasLowConfidence && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {rawText ? (
          <div>
            {viewMode === "clean" && (
              <div className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-5 font-mono text-sm leading-relaxed text-slate-800 select-text">
                {rawText}
              </div>
            )}

            {viewMode === "lines" && (
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
                {lines.map(
                  (line, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 px-4 py-2 font-mono text-xs transition hover:bg-white sm:text-sm"
                    >
                      <span className="w-8 shrink-0 select-none text-right font-semibold text-slate-400">
                        {index + 1}
                      </span>

                      <span className="flex-1 break-words text-slate-800 select-text">
                        {line}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            {viewMode === "regions" && (
              <div className="max-h-[700px] space-y-3 overflow-y-auto">
                {regions.map(
                  (region, index) => (
                    <RegionCard
                      key={index}
                      region={region}
                      index={index}
                    />
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-12 text-center">
            <FileText
              className="mx-auto text-slate-300"
              size={40}
            />

            <p className="mt-3 text-sm font-semibold text-slate-700">
              No text has been extracted yet
              for this document.
            </p>

            <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
              Run OCR processing to scan the
              image and extract all readable
              text.
            </p>

            <button
              disabled={ocrBusy}
              onClick={handleRunOcr}
              className="btn-primary mt-5 text-sm font-bold"
            >
              {ocrBusy ? (
                <>
                  <LoaderCircle
                    className="animate-spin"
                    size={16}
                  />
                  Running OCR…
                </>
              ) : (
                "Run OCR Text Extraction"
              )}
            </button>
          </div>
        )}

        {/* Prototype Scope Note */}

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-slate-200/60 bg-slate-100 p-4 text-xs text-slate-600">
          <Sparkles
            size={16}
            className="mt-0.5 shrink-0 text-brand-600"
          />

          <div>
            <p className="font-bold text-slate-800">
              OCR Text Extraction Scope:
            </p>

            <p className="mt-0.5 text-slate-600">
              This module extracts all readable
              characters directly from the
              uploaded document using an enhanced
              multi-stage pipeline (quality check
              → OpenCV preprocessing → layout
              detection → Tesseract OCR). No
              medical diagnosis, medicine
              identification, dosage mapping,
              symptom detection, or LLM
              interpretation is applied.
            </p>
          </div>
        </div>
      </div>

      {/* Analysis Summary */}

      <div>
        <h1 className="mt-4 text-3xl font-bold">
          Analysis Summary
        </h1>

        <div className="card mt-6 p-6">
          <p className="font-semibold">
            {doc.originalName}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {doc.documentType ===
            "PRESCRIPTION"
              ? "Prescription"
              : "Medical report"}{" "}
            · Uploaded{" "}
            {new Date(
              doc.uploadedAt
            ).toLocaleDateString()}
          </p>

          <section className="mt-6">
            <h2 className="font-bold">
              Simplified summary
            </h2>

            <p className="mt-2 leading-7 text-slate-700">
              {r?.summary ||
                "No analysis summary available."}
            </p>
          </section>

          <ResultList
            title="Medicines"
            items={
              r?.medicines?.map((x) => {
                const unreadable =
                  !x.name ||
                  x.name ===
                    "Not clearly readable from the uploaded document.";

                if (unreadable) {
                  return `Not clearly readable from the uploaded document.${
                    x.instructions
                      ? ` ${x.instructions}`
                      : ""
                  }`;
                }

                const details = [
                  x.dosage &&
                  x.dosage !==
                    "Not clearly readable from the uploaded document."
                    ? x.dosage
                    : null,

                  x.duration &&
                  x.duration !==
                    "Not clearly readable from the uploaded document."
                    ? x.duration
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return `${x.name}${
                  details
                    ? ` — ${details}`
                    : ""
                }${
                  x.instructions
                    ? `. ${x.instructions}`
                    : ""
                }`;
              }) ?? []
            }
          />

          <ResultList
            title="Key findings"
            items={r?.keyFindings ?? []}
          />

          <DiseaseResultList
            items={r?.potentialDiseases ?? []}
          />

          <ResultList
            title="Important notes / precautions"
            items={r?.precautions ?? []}
          />

          <ResultList
            title="Questions to ask your doctor"
            items={r?.questionsForDoctor ?? []}
          />

          <div className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">
            <b>Medical disclaimer: </b>
            {r?.disclaimer ||
              "This information is for educational purposes only and should not replace professional medical advice."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-2xl font-extrabold text-slate-900">
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultList
// ---------------------------------------------------------------------------

function ResultList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <section className="mt-6">
      <h2 className="font-bold text-slate-900">
        {title}
      </h2>

      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((item, index) => (
          <li key={index}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DiseaseResultList
// ---------------------------------------------------------------------------

function DiseaseResultList({
  items,
}: {
  items: string[];
}) {
  if (!items || !items.length) return null;

  return (
    <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="flex items-center gap-2 font-bold text-amber-900">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Potential Diseases & Clinical Risk Assessment
      </h2>

      <p className="mt-1 text-xs text-amber-700">
        Educational predictions derived from
        prescription medications or report
        findings. Consult your physician for
        medical confirmation.
      </p>

      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
        {items.map((item, index) => (
          <li key={index}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// RegionCard
// ---------------------------------------------------------------------------

function RegionCard({
  region,
  index,
}: {
  region: OcrRegion;
  index: number;
}) {
  const conf = Math.round(
    region.confidence * 100
  );

  const isLow =
    region.isLowConfidence;

  const isTable =
    region.type === "table_cell" ||
    region.type === "table";

  const badgeClass = isLow
    ? "bg-rose-100 text-rose-700 border border-rose-200"
    : conf >= 85
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : "bg-amber-100 text-amber-700 border border-amber-200";

  const cardClass = isLow
    ? "rounded-xl border border-rose-200 bg-rose-50 p-4"
    : "rounded-xl border border-slate-200 bg-slate-50 p-4";

  return (
    <div className={cardClass}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-400">
            Region {index + 1}

            {isTable &&
            region.tableInfo != null
              ? ` · Row ${
                  region.tableInfo.row + 1
                }, Col ${
                  region.tableInfo.col + 1
                }`
              : ""}
          </span>

          {isTable && (
            <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
              Table Cell
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLow && (
            <span className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
              <AlertTriangle size={10} />
              Needs Review
            </span>
          )}

          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass}`}
          >
            {conf}% confidence
          </span>
        </div>
      </div>

      {region.text ? (
        <p className="whitespace-pre-wrap break-words font-mono text-sm text-slate-800 select-text">
          {region.text}
        </p>
      ) : (
        <p className="text-xs italic text-slate-400">
          No text detected in this region.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfilePage
// ---------------------------------------------------------------------------

export { ProfilePage } from "./ProfilePage";