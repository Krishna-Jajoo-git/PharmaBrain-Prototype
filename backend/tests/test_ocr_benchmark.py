#!/usr/bin/env python3
import sys
import io
import os
import time
import json
import subprocess
import textwrap

# Force UTF-8 output on Windows to avoid cp1252 encode errors
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent directory to path so we can import preprocessor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "ocr"))

import numpy as np

RNG = np.random.default_rng(42)

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("[ERROR] opencv-python not installed. Run: pip install opencv-python")
    sys.exit(1)

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:
    HAS_PYTESSERACT = False
    print("[WARN] pytesseract not installed. OCR step will be skipped.")
    print("       To install: pip install pytesseract")
    print("       Preprocessor quality checks and region detection will still run.")

# Paths
PREPROCESSOR_PY = os.path.join(os.path.dirname(__file__), "..", "src", "ocr", "preprocessor.py")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "_benchmark")


# ---------------------------------------------------------------------------
# Helpers: Synthetic Image Generators
# ---------------------------------------------------------------------------

def blank(w=794, h=650, bg=255):
    return np.ones((h, w, 3), dtype=np.uint8) * bg


def write_text(img, lines, start_y=60, x=50, dy=45, font_scale=0.78,
               thickness=1, color=(30, 30, 30)):
    y = start_y
    for line in lines:
        cv2.putText(img, line, (x, y), cv2.FONT_HERSHEY_SIMPLEX,
                    font_scale, color, thickness, cv2.LINE_AA)
        y += dy
    return img


def draw_table(img, rows, start_x=40, start_y=200, cell_w=160, cell_h=42):
    for r_idx, row in enumerate(rows):
        for c_idx, cell_text in enumerate(row):
            x = start_x + c_idx * cell_w
            y = start_y + r_idx * cell_h
            cv2.rectangle(img, (x, y), (x + cell_w, y + cell_h), (80, 80, 80), 1)
            cv2.putText(img, cell_text, (x + 6, y + cell_h - 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (20, 20, 20), 1, cv2.LINE_AA)
    return img


# ---------------------------------------------------------------------------
# Scenario Generators
# ---------------------------------------------------------------------------

def gen_clear():
    """Scenario 1: Clear printed prescription"""
    img = blank()
    lines = [
        "Rx  Medical Centre, 824 14th St, NY",
        "Dr. Steve Johnson   License: MED-2024-7731",
        "Patient: John Smith   Age: 34   Date: 13-09-2026",
        "1. Amoxicillin 500mg  - 3x daily for 7 days",
        "2. Paracetamol 500mg  - Every 6 hours as needed",
        "3. Omeprazole 20mg    - Once daily before breakfast",
        "Refills: 0     Signature: _________________",
    ]
    return write_text(img, lines, dy=50)


def gen_blurry():
    """Scenario 2: Blurry / camera-captured prescription"""
    img = gen_clear()
    img = cv2.GaussianBlur(img, (9, 9), 4)
    img = cv2.convertScaleAbs(img, alpha=0.65, beta=70)
    noise = RNG.normal(0, 20, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img


def gen_handwritten():
    """Scenario 3: Simulated handwritten prescription"""
    img = blank()
    lines = [
        "Rx  Dr. S. Johnson",
        "Pt: J. Smith  Dt: 13/09/26",
        "1/ Amoxicillin 500mg  TDS x 7 days",
        "2/ Paracetamol 500mg  SOS for pain",
        "3/ Omeprazole 20mg    OD before food",
        "Sig: _________",
    ]
    for i, line in enumerate(lines):
        y = 80 + i * 60
        cv2.putText(img, line, (55, y), cv2.FONT_HERSHEY_SCRIPT_SIMPLEX,
                    0.80, (40, 20, 10), 1, cv2.LINE_AA)
    grain = RNG.normal(0, 8, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + grain, 0, 255).astype(np.uint8)
    return img


def gen_multi_region():
    """Scenario 4: Multi-region document"""
    img = blank()
    # Header
    write_text(img, ["=== CITY MEDICAL CENTRE ===",
                     "824 14th Street, New York, NY 10001"],
               start_y=50, x=200, dy=28, font_scale=0.60)
    cv2.line(img, (40, 100), (754, 100), (120, 120, 120), 1)
    # Patient info (left)
    write_text(img, ["Patient: John Smith", "DOB: 15-05-1992  Age: 34"],
               start_y=130, x=50, dy=28, font_scale=0.60)
    # Date (right)
    write_text(img, ["Date: 13-09-2026", "Dr. Steve Johnson"],
               start_y=130, x=480, dy=28, font_scale=0.60)
    cv2.line(img, (40, 190), (754, 190), (120, 120, 120), 1)
    # Rx section
    write_text(img, ["Rx:", "1. Amoxicillin 500mg - TDS x 7 days",
                     "2. Paracetamol 500mg - SOS q6h",
                     "3. Omeprazole 20mg   - OD ac"],
               start_y=220, x=50, dy=36, font_scale=0.68)
    # Instructions
    write_text(img, ["Instructions: Take with food. Return in 7 days."],
               start_y=390, x=50, dy=30, font_scale=0.58)
    cv2.line(img, (40, 420), (754, 420), (160, 160, 160), 1)
    cv2.putText(img, "Signature: _____________________", (50, 455),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (60, 60, 60), 1, cv2.LINE_AA)
    return img


def gen_table():
    """Scenario 5: Table-like prescription layout"""
    img = blank()
    write_text(img, ["Rx  Dr. Steve Johnson  Date: 13-09-2026",
                     "Patient: John Smith  Age: 34"],
               start_y=55, dy=36, font_scale=0.72)
    cv2.line(img, (40, 110), (754, 110), (100, 100, 100), 1)
    table_rows = [
        ["Drug Name",   "Dosage", "Timing", "Duration"],
        ["Amoxicillin", "500mg",  "TDS",    "7 days"],
        ["Paracetamol", "500mg",  "SOS q6h","PRN"],
        ["Omeprazole",  "20mg",   "OD",     "14 days"],
        ["Metformin",   "500mg",  "BD",     "30 days"],
        ["Amlodipine",  "5mg",    "OD",     "30 days"],
    ]
    draw_table(img, table_rows, start_y=125, cell_w=170, cell_h=44)
    cv2.putText(img, "Instructions: Take with water after food.",
                (40, 410), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (40, 40, 40), 1)
    cv2.putText(img, "Signature: _________________", (40, 455),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (40, 40, 40), 1)
    return img


# ---------------------------------------------------------------------------
# Test Runners
# ---------------------------------------------------------------------------

def run_preprocessor(img_path):
    start = time.time()
    try:
        result = subprocess.run(
            [sys.executable, PREPROCESSOR_PY, img_path, OUTPUT_DIR],
            capture_output=True, text=True, timeout=30
        )
        elapsed = (time.time() - start) * 1000
        data = json.loads(result.stdout)
        data["_prep_ms"] = round(elapsed, 1)
        return data
    except subprocess.TimeoutExpired:
        return {"error": "Preprocessor timed out (>30s)"}
    except Exception as e:
        return {"error": str(e)}


def run_ocr(img_path):
    if not HAS_PYTESSERACT:
        return {"text": "(pytesseract not installed -- OCR skipped)", "confidence": None}
    start = time.time()
    try:
        from pytesseract import Output
        data = pytesseract.image_to_data(img_path, output_type=Output.DICT,
                                         config="--oem 1 --psm 6")
        words = [w for w in data["text"] if w.strip()]
        confs = [int(c) for c, w in zip(data["conf"], data["text"])
                 if w.strip() and int(c) >= 0]
        text = pytesseract.image_to_string(img_path, config="--oem 1 --psm 6").strip()
        avg_conf = round(sum(confs) / len(confs), 1) if confs else 0
        return {"text": text, "confidence": avg_conf, "time_ms": round((time.time()-start)*1000,1)}
    except Exception as e:
        return {"text": f"(OCR error: {e})", "confidence": None}


def hr(char="-", width=70):
    print(char * width)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

SCENARIOS = [
    ("1_clear",        gen_clear,        "Clear printed prescription"),
    ("2_blurry",       gen_blurry,       "Blurry / camera-captured"),
    ("3_handwritten",  gen_handwritten,  "Handwritten prescription"),
    ("4_multi_region", gen_multi_region, "Multi-region document"),
    ("5_table",        gen_table,        "Table-like prescription"),
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print()
    print("=" * 70)
    print("  PharmaBrain OCR Benchmark Test Suite")
    print("=" * 70)
    print()

    for scenario_id, generator, description in SCENARIOS:
        # 1. Generate test image
        img = generator()
        orig_path = os.path.join(OUTPUT_DIR, f"{scenario_id}_original.png")
        cv2.imwrite(orig_path, img)

        # 2. Preprocessor
        prep = run_preprocessor(orig_path)
        if prep.get("error"):
            print(f"  [PREPROCESSOR ERROR] {description}: {prep['error']}")
            continue

        prep_path = prep.get("printedImagePath")
        q = prep.get("quality", {})
        regions = prep.get("regions", [])

        # 3. OCR on original
        ocr_orig = run_ocr(orig_path)

        # 4. OCR on preprocessed
        ocr_prep = run_ocr(prep_path) if prep_path else ocr_orig

        # 5. Print results
        hr("=")
        print(f"  Scenario: {description}")
        hr()
        print(f"  Original image:     {orig_path}")
        print(f"  Preprocessed image: {prep_path or '(unavailable)'}")
        hr()
        print(f"  Quality Metrics:")
        print(f"    Blur score:     {q.get('blurScore','?')}  (blurry: {q.get('isBlurry','?')})")
        print(f"    Contrast score: {q.get('contrastScore','?')}  (low contrast: {q.get('isLowContrast','?')})")
        print(f"    Skew angle:     {q.get('skewAngle', 0):.1f} deg")
        for w in q.get("qualityWarnings", []):
            print(f"    [!] {w}")
        hr()
        print(f"  Regions detected: {len(regions)}")
        for i, r in enumerate(regions[:5]):
            ti = r.get("tableInfo")
            ti_str = f" [row={ti['row']}, col={ti['col']}]" if ti else ""
            print(f"    [{i+1}] {r['type']}{ti_str}  bbox={r['bbox']}")
        if len(regions) > 5:
            print(f"    ... and {len(regions)-5} more")
        hr()
        print("  OCR on preprocessed image:")
        txt = ocr_prep.get("text", "")
        if txt and not txt.startswith("("):
            for ln in txt[:500].split("\n")[:12]:
                if ln.strip():
                    print(f"    {ln}")
        else:
            print(f"    {txt}")
        c = ocr_prep.get("confidence")
        t = ocr_prep.get("time_ms")
        print()
        print(f"  Confidence: {str(c)+'%' if c is not None else 'n/a'}   "
              f"OCR: {str(t)+' ms' if t else 'n/a'}   "
              f"Preprocessing: {prep.get('_prep_ms','?')} ms")
        print()

    hr("=")
    print(f"\n  Test images saved to: {OUTPUT_DIR}")
    print()


if __name__ == "__main__":
    main()
