from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.board_geometry import BOARD_SIZE_MM, DEMO_LEFT, DEMO_RIGHT, BoardSpec  # noqa: E402
from app.cv.marker_detector import april_tag_dictionary  # noqa: E402


DPI = 300
PX_PER_MM = DPI / 25.4


def board_image(board: BoardSpec) -> np.ndarray:
    size = int(round(BOARD_SIZE_MM * PX_PER_MM))
    marker_size = int(round(40.0 * PX_PER_MM))
    canvas = np.full((size, size), 255, np.uint8)
    for index, marker_id in enumerate(board.marker_ids):
        marker = cv2.aruco.generateImageMarker(
            april_tag_dictionary(), marker_id, marker_size, borderBits=1
        )
        x_mm = 10.0 + (index % 2) * 60.0
        y_mm = 10.0 + (index // 2) * 60.0
        x = int(round(x_mm * PX_PER_MM))
        y = int(round(y_mm * PX_PER_MM))
        canvas[y : y + marker_size, x : x + marker_size] = marker
    return canvas


def write_pdf(board: BoardSpec, png_path: Path, pdf_path: Path) -> None:
    canvas = Canvas(str(pdf_path), pagesize=A4)
    page_w, page_h = A4
    x = (page_w - BOARD_SIZE_MM * mm) / 2
    y = 52 * mm
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawCentredString(page_w / 2, page_h - 25 * mm, "GEO RECHECK")
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawCentredString(page_w / 2, page_h - 36 * mm, f"MP-03  {board.side}")
    canvas.drawImage(
        str(png_path), x, y, width=BOARD_SIZE_MM * mm, height=BOARD_SIZE_MM * mm
    )
    canvas.setFont("Helvetica", 9)
    canvas.drawCentredString(page_w / 2, 42 * mm, "Print at 100% scale. Board: 120 mm x 120 mm")
    canvas.drawCentredString(page_w / 2, 36 * mm, f"Marker IDs: {', '.join(map(str, board.marker_ids))}")
    canvas.drawCentredString(page_w / 2, 30 * mm, "Verify the 120 mm edge with a ruler before use.")
    canvas.showPage()
    canvas.save()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "markers")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    for board in (DEMO_LEFT, DEMO_RIGHT):
        stem = f"GZ-TZ-DEMO-001_MP-03_{board.side}"
        png_path = args.output / f"{stem}.png"
        pdf_path = args.output / f"{stem}.pdf"
        Image.fromarray(board_image(board)).save(png_path, dpi=(DPI, DPI))
        write_pdf(board, png_path, pdf_path)
        print(f"generated {png_path}")
        print(f"generated {pdf_path}")


if __name__ == "__main__":
    main()

