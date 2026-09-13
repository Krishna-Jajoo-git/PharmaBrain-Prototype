#!/usr/bin/env python3
"""
PharmaBrain OCR Preprocessor
=============================
Performs image quality assessment, intelligent preprocessing, and layout/region
detection for uploaded medical prescriptions. Outputs a JSON result consumed by
the Node.js OCR service.

Usage:
    python preprocessor.py <image_path> [output_dir]

Output (stdout):
    JSON with quality metrics, preprocessed image paths, and detected regions.
"""

import sys
import os
import json
import time
import math
import traceback

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_BLUR_SCORE         = 100.0    # Below this → flagged as blurry
MIN_CONTRAST_SCORE     = 30.0     # Below this → low contrast warning
TARGET_MIN_DIMENSION   = 1200     # px — upscale if smaller than this
TARGET_DPI_SCALE       = 2.0      # Upscale factor when image is small
HANDWRITING_CONF_THRESH= 0.65     # Below this confidence → needs review


# ---------------------------------------------------------------------------
# Image Quality Assessment
# ---------------------------------------------------------------------------

def assess_quality(gray: np.ndarray) -> dict:
    """
    Compute blur, contrast, and skew metrics.
    Returns a dict with quality flags.
    """
    # Blur via Laplacian variance
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    blur_score = float(np.var(lap))
    is_blurry = blur_score < MIN_BLUR_SCORE

    # Contrast via RMS of pixel intensities
    contrast_score = float(np.std(gray.astype(np.float32)))
    is_low_contrast = contrast_score < MIN_CONTRAST_SCORE

    # Skew detection via Hough lines
    skew_angle = _estimate_skew(gray)

    quality_warnings = []
    if is_blurry:
        quality_warnings.append(f"Image appears blurry (score={blur_score:.1f}). "
                                  "OCR accuracy may be reduced.")
    if is_low_contrast:
        quality_warnings.append(f"Low contrast detected (score={contrast_score:.1f}). "
                                  "Preprocessing will attempt enhancement.")
    if abs(skew_angle) > 2.0:
        quality_warnings.append(f"Document appears skewed ({skew_angle:.1f}°). "
                                  "Auto-deskewing will be applied.")

    return {
        "blurScore":       round(blur_score, 2),
        "contrastScore":   round(contrast_score, 2),
        "skewAngle":       round(skew_angle, 2),
        "isBlurry":        is_blurry,
        "isLowContrast":   is_low_contrast,
        "qualityWarnings": quality_warnings,
    }


def _estimate_skew(gray: np.ndarray) -> float:
    """
    Estimate document skew angle using Hough lines on edge image.
    Returns angle in degrees. Positive = clockwise tilt.
    """
    try:
        # Work on a downscaled copy for speed
        h, w = gray.shape
        scale = min(1.0, 600 / max(h, w))
        small = cv2.resize(gray, (int(w * scale), int(h * scale)))

        edges = cv2.Canny(small, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, math.pi / 180, threshold=80,
                                minLineLength=int(small.shape[1] * 0.3),
                                maxLineGap=20)
        if lines is None:
            return 0.0

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 == x1:
                continue
            angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
            # Keep only near-horizontal lines (within ±30°)
            if abs(angle) < 30:
                angles.append(angle)

        if not angles:
            return 0.0
        return float(np.median(angles))
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def upscale_if_needed(img: np.ndarray) -> np.ndarray:
    """Upscale small images to improve OCR accuracy."""
    h, w = img.shape[:2]
    if min(h, w) < TARGET_MIN_DIMENSION:
        scale = TARGET_DPI_SCALE
        img = cv2.resize(img, (int(w * scale), int(h * scale)),
                         interpolation=cv2.INTER_CUBIC)
    return img


def deskew(img: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image to correct detected skew."""
    if abs(angle) < 0.5:
        return img
    h, w = img.shape[:2]
    center = (w / 2, h / 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(img, M, (w, h),
                             flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_REPLICATE)
    return rotated


def preprocess_printed(gray: np.ndarray) -> np.ndarray:
    """
    Preprocessing variant for printed / clear text.
    Applies CLAHE → light Gaussian blur → adaptive threshold.
    """
    # CLAHE for contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Light Gaussian blur to reduce noise without destroying letters
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)

    # Adaptive thresholding — handles uneven lighting
    binary = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=21,
        C=8
    )
    return binary


def preprocess_handwriting(gray: np.ndarray) -> np.ndarray:
    """
    Preprocessing variant for handwritten text.
    Bilateral filter preserves pen stroke edges while suppressing background.
    Lighter thresholding prevents destroying thin strokes.
    """
    # Bilateral filter — smooths background, preserves edges
    denoised = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # CLAHE with lower clip to avoid over-sharpening cursive strokes
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Gentler adaptive threshold with larger block size for cursive
    binary = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=31,
        C=10
    )
    return binary


def layout_binary(gray: np.ndarray) -> np.ndarray:
    """A conservative foreground mask for layout detection only.

    Adaptive thresholding is useful for OCR variants but can turn camera noise
    into connected foreground and collapse an entire prescription into one
    region. Otsu's global mask is deliberately kept separate from OCR images.
    """
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


# ---------------------------------------------------------------------------
# Layout & Region Detection
# ---------------------------------------------------------------------------

def detect_regions(gray: np.ndarray, binary: np.ndarray) -> list:
    """
    Detect text regions in the image:
    - First tries to find table structure (horizontal + vertical lines).
    - Falls back to morphological text block detection.
    Returns a list of region dicts with bounding box, type, and table metadata.
    """
    table_regions = _detect_table_cells(binary)
    if table_regions:
        # Also detect non-table text blocks around the table
        tx1 = min(r["bbox"][0] for r in table_regions)
        ty1 = min(r["bbox"][1] for r in table_regions)
        tx2 = max(r["bbox"][0] + r["bbox"][2] for r in table_regions)
        ty2 = max(r["bbox"][1] + r["bbox"][3] for r in table_regions)
        other_regions = _detect_text_blocks(binary, exclude_rects=[[tx1, ty1, tx2 - tx1, ty2 - ty1]])
        return sorted(other_regions + table_regions,
                      key=lambda r: (r["bbox"][1], r["bbox"][0]))

    return _detect_text_blocks(binary, exclude_rects=[])


def _detect_table_cells(binary: np.ndarray) -> list:
    """
    Detect table cells using morphological kernels to find horizontal and
    vertical lines, then find intersecting cell grid.
    """
    h, w = binary.shape[:2]

    # Invert for morphology (text=white on black background)
    inv = cv2.bitwise_not(binary)

    # Detect horizontal lines
    h_kernel_len = max(int(w * 0.15), 30)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
    h_lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, h_kernel, iterations=2)

    # Detect vertical lines
    v_kernel_len = max(int(h * 0.15), 30)
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))
    v_lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, v_kernel, iterations=2)

    # Combine line masks. A complete table normally forms one connected
    # component, so connected-component count is not a useful table signal.
    grid = cv2.add(h_lines, v_lines)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grid = cv2.dilate(grid, kernel, iterations=2)
    contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [cv2.boundingRect(c) for c in contours]
    candidates = [box for box in candidates if box[2] > w * 0.35 and box[3] > h * 0.08]
    if not candidates:
        return []

    table_x1, table_y1, table_w, table_h = max(candidates, key=lambda b: b[2] * b[3])
    table_x2, table_y2 = table_x1 + table_w, table_y1 + table_h

    # Find line centres rather than raw split positions. Cells lie between
    # adjacent horizontal and vertical grid lines, not before/after them.
    h_proj = np.count_nonzero(h_lines[table_y1:table_y2, table_x1:table_x2], axis=1)
    v_proj = np.count_nonzero(v_lines[table_y1:table_y2, table_x1:table_x2], axis=0)
    h_splits = _find_splits(h_proj, threshold=max(8, int(table_w * 0.45)))
    v_splits = _find_splits(v_proj, threshold=max(8, int(table_h * 0.45)))

    if len(h_splits) < 2 or len(v_splits) < 2:
        # Table grid detected but couldn't split — return table as one region
        return [{
            "bbox":      [table_x1, table_y1, table_x2 - table_x1, table_y2 - table_y1],
            "type":      "table",
            "tableInfo": {"row": 0, "col": 0, "totalRows": 1, "totalCols": 1},
        }]

    # Build cell list
    cells = []
    row_bounds = list(zip(h_splits[:-1], h_splits[1:]))
    col_bounds = list(zip(v_splits[:-1], v_splits[1:]))

    for r_idx, (ry1, ry2) in enumerate(row_bounds):
        for c_idx, (cx1, cx2) in enumerate(col_bounds):
            # Keep line pixels out of the OCR crop.
            abs_x = table_x1 + cx1 + 2
            abs_y = table_y1 + ry1 + 2
            cell_w = cx2 - cx1 - 4
            cell_h = ry2 - ry1 - 4
            if cell_w < 5 or cell_h < 5:
                continue
            cells.append({
                "bbox":      [abs_x, abs_y, cell_w, cell_h],
                "type":      "table_cell",
                "tableInfo": {
                    "row": r_idx,
                    "col": c_idx,
                    "totalRows": len(row_bounds),
                    "totalCols": len(col_bounds),
                },
            })

    return cells


def _find_splits(projection: np.ndarray, threshold: float) -> list:
    """Find positions in projection where value is above threshold (line positions)."""
    splits = []
    in_line = False
    line_start = 0
    for i, v in enumerate(projection):
        if v >= threshold and not in_line:
            in_line = True
            line_start = i
        elif v < threshold and in_line:
            in_line = False
            splits.append((line_start + i) // 2)
    return splits


def _detect_text_blocks(binary: np.ndarray, exclude_rects: list) -> list:
    """
    Find text block regions via morphological dilation.
    Sorts blocks in natural reading order (top-to-bottom, left-to-right).
    """
    h, w = binary.shape[:2]
    inv = cv2.bitwise_not(binary)

    # Dilate horizontally to merge letters into words, then into lines/blocks
    dil_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(int(w * 0.05), 20), 5))
    dilated = cv2.dilate(inv, dil_kernel, iterations=3)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = w * h * 0.001  # At least 0.1% of image area
    regions = []

    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        if area < min_area or bw < 10 or bh < 8:
            continue
        # Printed horizontal rules are layout decoration, not OCR regions.
        if bw > w * 0.60 and bh <= max(12, int(h * 0.015)):
            continue

        # Skip if heavily overlapping with excluded (table) regions
        if _overlaps_any(x, y, bw, bh, exclude_rects):
            continue

        regions.append({
            "bbox": [int(x), int(y), int(bw), int(bh)],
            "type": "text_block",
            "tableInfo": None,
        })

    # Sort in reading order: top-to-bottom (with 20px row grouping), left-to-right
    regions.sort(key=lambda r: (r["bbox"][1] // 20, r["bbox"][0]))
    return regions


def _overlaps_any(x: int, y: int, w: int, h: int, rects: list) -> bool:
    """Return True if (x,y,w,h) overlaps significantly with any rect in rects."""
    for rx, ry, rw, rh in rects:
        # Intersection
        ix1 = max(x, rx)
        iy1 = max(y, ry)
        ix2 = min(x + w, rx + rw)
        iy2 = min(y + h, ry + rh)
        if ix2 > ix1 and iy2 > iy1:
            inter_area = (ix2 - ix1) * (iy2 - iy1)
            if inter_area > 0.3 * w * h:
                return True
    return False


# ---------------------------------------------------------------------------
# Save preprocessed images
# ---------------------------------------------------------------------------

def save_image(img: np.ndarray, path: str) -> str:
    """Save image and return the absolute path."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, img)
    return os.path.abspath(path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process(image_path: str, output_dir: str) -> dict:
    start = time.time()

    if not os.path.exists(image_path):
        return {"error": f"File not found: {image_path}"}

    img = cv2.imread(image_path)
    if img is None:
        # Try base64 path or return error
        return {"error": f"Could not decode image: {image_path}"}

    # --- 1. Upscale if needed
    img = upscale_if_needed(img)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # --- 2. Quality assessment
    quality = assess_quality(gray)

    # --- 3. Deskew
    corrected_gray = deskew(gray, quality["skewAngle"])

    # --- 4. Generate preprocessing variants
    printed_bin  = preprocess_printed(corrected_gray)
    hw_bin       = preprocess_handwriting(corrected_gray)

    # --- 5. Save preprocessed images
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    printed_path = save_image(printed_bin,  os.path.join(output_dir, f"{base_name}_printed.png"))
    hw_path      = save_image(hw_bin,       os.path.join(output_dir, f"{base_name}_handwriting.png"))
    gray_path    = save_image(corrected_gray, os.path.join(output_dir, f"{base_name}_gray.png"))

    # --- 6. Region detection on a conservative mask. OCR itself still gets
    # the tailored variants above; this avoids camera noise merging all text.
    regions = detect_regions(corrected_gray, layout_binary(corrected_gray))

    # Also fallback: if no regions found, treat whole image as one block
    if not regions:
        h, w = corrected_gray.shape[:2]
        regions = [{"bbox": [0, 0, w, h], "type": "text_block", "tableInfo": None}]

    elapsed_ms = round((time.time() - start) * 1000, 1)

    return {
        "quality":          quality,
        "printedImagePath": printed_path,
        "hwImagePath":      hw_path,
        "grayImagePath":    gray_path,
        "regions":          regions,
        "processingMs":     elapsed_ms,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: preprocessor.py <image_path> [output_dir]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(image_path)), "_preprocessed"
    )

    try:
        result = process(image_path, output_dir)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)
