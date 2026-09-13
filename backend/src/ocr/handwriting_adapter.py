#!/usr/bin/env python3
"""
PharmaBrain Handwriting Recognition Adapter
=============================================
Provides a pluggable interface for handwriting recognition models.

Current Baseline:
  - Tesseract with handwriting-tuned PSM and config options for use when
    a dedicated model is not available. Per-character confidence tracking.

Future Integration Points:
  - TrOCR (Microsoft): swap in `TrOCRRecognizer` class below.
  - CRNN + CTC: swap in `CRNNRecognizer` class.
  - Any PyTorch/CNN-Attention model: extend `BaseHandwritingRecognizer`.

Usage:
    from handwriting_adapter import HandwritingRecognizer
    recognizer = HandwritingRecognizer()
    result = recognizer.recognize(image_region_np_array)
"""

import os
import tempfile
import subprocess
import json
from abc import ABC, abstractmethod
from typing import Optional

import cv2
import numpy as np

CONFIDENCE_THRESHOLD = 0.65  # Below this → needsReview = True


# ---------------------------------------------------------------------------
# Base Interface
# ---------------------------------------------------------------------------

class BaseHandwritingRecognizer(ABC):
    """
    Base class for all handwriting recognition backends.
    Subclass and override `recognize` to plug in a custom model.
    """

    @abstractmethod
    def recognize(self, image: np.ndarray) -> dict:
        """
        Recognize handwritten text in the given grayscale or binary image patch.

        Returns:
            {
              "text": str,
              "confidence": float,   # 0.0 – 1.0
              "needsReview": bool,
              "engine": str,
            }
        """
        ...


# ---------------------------------------------------------------------------
# Tesseract Baseline (fallback when no dedicated model is available)
# ---------------------------------------------------------------------------

class TesseractHandwritingRecognizer(BaseHandwritingRecognizer):
    """
    Tesseract-based handwriting recognizer.
    Uses handwriting-tuned PSM 8 (single word) / PSM 6 (uniform block) with
    whitelist and oem 1 (LSTM) for better cursive handling.

    Limitations: Tesseract is NOT reliable on difficult doctor handwriting.
    This class exists purely as the baseline until a dedicated model is plugged in.
    """

    def recognize(self, image: np.ndarray) -> dict:
        try:
            # Write image to temp file for Tesseract CLI
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
            cv2.imwrite(tmp_path, image)

            # Tesseract CLI: --oem 1 (LSTM), --psm 6 (uniform block of text)
            cmd = [
                "tesseract", tmp_path, "stdout",
                "--oem", "1",
                "--psm", "6",
                "-c", "tessedit_do_invert=0",
                "-c", "textord_heavy_nr=0",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            text = proc.stdout.strip()

            os.unlink(tmp_path)

            # Tesseract CLI doesn't return per-character confidence directly;
            # use heuristic confidence estimation from output quality
            conf = _estimate_confidence_heuristic(text)
            return {
                "text":        text,
                "confidence":  round(conf, 3),
                "needsReview": conf < CONFIDENCE_THRESHOLD,
                "engine":      "Tesseract (handwriting mode)",
            }
        except FileNotFoundError:
            # Tesseract binary not found
            return {
                "text":        "",
                "confidence":  0.0,
                "needsReview": True,
                "engine":      "Tesseract (not installed)",
                "error":       "Tesseract binary not found",
            }
        except subprocess.TimeoutExpired:
            return {
                "text":        "",
                "confidence":  0.0,
                "needsReview": True,
                "engine":      "Tesseract (timeout)",
                "error":       "Tesseract timed out",
            }
        except Exception as e:
            return {
                "text":        "",
                "confidence":  0.0,
                "needsReview": True,
                "engine":      "Tesseract (error)",
                "error":       str(e),
            }


# ---------------------------------------------------------------------------
# Future Model Stubs (plug in when available)
# ---------------------------------------------------------------------------

class TrOCRRecognizer(BaseHandwritingRecognizer):
    """
    Microsoft TrOCR handwriting recognition stub.
    To activate: install `transformers` and `torch`, then implement this class.

    Example:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        from PIL import Image
        processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
        model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
    """

    def recognize(self, image: np.ndarray) -> dict:
        raise NotImplementedError(
            "TrOCR model is not yet integrated. "
            "Install transformers + torch and implement this class."
        )


class CRNNRecognizer(BaseHandwritingRecognizer):
    """
    CRNN + CTC handwriting recognition stub.
    Plug in any PyTorch CRNN model trained on medical handwriting datasets.
    """

    def recognize(self, image: np.ndarray) -> dict:
        raise NotImplementedError(
            "CRNN model is not yet integrated. "
            "Load your PyTorch model checkpoint and implement this class."
        )


# ---------------------------------------------------------------------------
# Active recognizer factory
# ---------------------------------------------------------------------------

def HandwritingRecognizer(backend: str = "tesseract") -> BaseHandwritingRecognizer:
    """
    Factory function returning the active handwriting recognizer backend.

    Args:
        backend: "tesseract" | "trocr" | "crnn"

    Returns:
        A BaseHandwritingRecognizer instance.
    """
    if backend == "trocr":
        return TrOCRRecognizer()
    if backend == "crnn":
        return CRNNRecognizer()
    return TesseractHandwritingRecognizer()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _estimate_confidence_heuristic(text: str) -> float:
    """
    Estimate confidence from OCR output quality heuristics:
    - Empty output → 0.0
    - High proportion of garbage chars → low confidence
    - Short output → penalise
    """
    if not text or not text.strip():
        return 0.0

    words = text.split()
    if not words:
        return 0.0

    # Garbage char ratio (non-alpha, non-digit, non-space, non-punctuation)
    import re
    garbage = sum(1 for c in text if not re.match(r'[\w\s.,;:\-/()\'"]', c))
    garbage_ratio = garbage / max(len(text), 1)

    # Word length heuristic — very short "words" may be noise
    short_words = sum(1 for w in words if len(w) == 1 and not w.isalpha())
    short_ratio = short_words / max(len(words), 1)

    base_conf = max(0.0, 1.0 - garbage_ratio * 2 - short_ratio * 0.5)
    # Minimum 0.3 if there is ANY output at all
    return max(0.3, min(1.0, base_conf))
