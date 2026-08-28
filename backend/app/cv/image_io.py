from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def read_image(path: Path, flags: int = cv2.IMREAD_COLOR) -> np.ndarray | None:
    """Unicode-safe image read for Windows paths."""
    if not path.exists():
        return None
    data = np.fromfile(path, dtype=np.uint8)
    return cv2.imdecode(data, flags)


def write_image(path: Path, image: np.ndarray) -> None:
    """Unicode-safe image write that fails loudly instead of returning False."""
    path.parent.mkdir(parents=True, exist_ok=True)
    extension = path.suffix or ".png"
    success, encoded = cv2.imencode(extension, image)
    if not success:
        raise RuntimeError(f"Image encoding failed: {path}")
    encoded.tofile(path)
