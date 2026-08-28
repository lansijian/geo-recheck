from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.board_geometry import BOARD_HEIGHT_MM, BOARD_WIDTH_MM, DEMO_LEFT, DEMO_RIGHT, BoardSpec  # noqa: E402
from app.cv.synthetic import make_board_texture  # noqa: E402


DPI = 300
PX_PER_MM = DPI / 25.4


def board_image(board: BoardSpec) -> np.ndarray:
    return make_board_texture(board, PX_PER_MM)


def write_pdf(board: BoardSpec, png_path: Path, pdf_path: Path) -> None:
    canvas = Canvas(str(pdf_path), pagesize=A4)
    page_w, page_h = A4
    x = (page_w - BOARD_WIDTH_MM * mm) / 2
    y = 92 * mm
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawCentredString(page_w / 2, page_h - 25 * mm, "GEO RECHECK")
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawCentredString(page_w / 2, page_h - 36 * mm, f"MP-03  {board.side}")
    canvas.drawImage(
        str(png_path), x, y, width=BOARD_WIDTH_MM * mm, height=BOARD_HEIGHT_MM * mm
    )
    canvas.setFont("Helvetica", 9)
    canvas.drawCentredString(page_w / 2, 78 * mm, "Print at 100% scale. Recheck sticker: 100 mm x 60 mm")
    canvas.drawCentredString(page_w / 2, 72 * mm, f"CRACK-W01 {board.side} | Marker IDs: {', '.join(map(str, board.marker_ids))}")
    canvas.drawCentredString(page_w / 2, 66 * mm, "Verify the 100 mm edge with a ruler before use.")
    canvas.showPage()
    canvas.save()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "markers")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    for board in (DEMO_LEFT, DEMO_RIGHT):
        stem = f"CRACK-W01_RECHECK_STICKER_{board.side}_V2"
        png_path = args.output / f"{stem}.png"
        pdf_path = args.output / f"{stem}.pdf"
        Image.fromarray(board_image(board)).save(png_path, dpi=(DPI, DPI))
        write_pdf(board, png_path, pdf_path)
        print(f"generated {png_path}")
        print(f"generated {pdf_path}")


if __name__ == "__main__":
    main()
