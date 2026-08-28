from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.calibration import BOARD_SQUARES, SQUARE_LENGTH_MM, charuco_board  # noqa: E402


def main() -> None:
    output = ROOT / "artifacts" / "calibration"
    output.mkdir(parents=True, exist_ok=True)
    width_mm = BOARD_SQUARES[0] * SQUARE_LENGTH_MM
    height_mm = BOARD_SQUARES[1] * SQUARE_LENGTH_MM
    px_per_mm = 300 / 25.4
    board = charuco_board()
    image = board.generateImage(
        (int(round(width_mm * px_per_mm)), int(round(height_mm * px_per_mm))),
        marginSize=0,
        borderBits=1,
    )
    png = output / "charuco_7x5_300dpi.png"
    Image.fromarray(image).save(png, dpi=(300, 300))

    pdf = output / "charuco_7x5_print_100_percent.pdf"
    canvas = Canvas(str(pdf), pagesize=A4)
    page_w, page_h = A4
    x = (page_w - width_mm * mm) / 2
    y = (page_h - height_mm * mm) / 2
    canvas.drawImage(str(png), x, y, width=width_mm * mm, height=height_mm * mm)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(page_w / 2, y - 8 * mm, f"Print 100% | square {SQUARE_LENGTH_MM:.1f} mm | board {width_mm:.1f} x {height_mm:.1f} mm")
    canvas.showPage()
    canvas.save()
    print(png)
    print(pdf)


if __name__ == "__main__":
    main()

