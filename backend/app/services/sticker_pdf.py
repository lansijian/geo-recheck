from __future__ import annotations

import io

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from app.cv.board_geometry import BOARD_HEIGHT_MM, BOARD_WIDTH_MM, BoardSpec
from app.cv.synthetic import make_board_texture


DPI = 300
PX_PER_MM = DPI / 25.4


def board_png_bytes(board: BoardSpec) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(make_board_texture(board, PX_PER_MM)).save(
        buffer, format="PNG", dpi=(DPI, DPI)
    )
    return buffer.getvalue()


def _draw_board_page(canvas: Canvas, point_label: str, board: BoardSpec) -> None:
    page_w, page_h = A4
    x = (page_w - BOARD_WIDTH_MM * mm) / 2
    y = 92 * mm
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawCentredString(page_w / 2, page_h - 25 * mm, "GEO RECHECK")
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawCentredString(page_w / 2, page_h - 36 * mm, f"{point_label}  {board.side}")
    # Canvas.drawImage needs an ImageReader, not a raw file object.
    canvas.drawImage(
        ImageReader(io.BytesIO(board_png_bytes(board))),
        x, y, width=BOARD_WIDTH_MM * mm, height=BOARD_HEIGHT_MM * mm,
    )
    canvas.setFont("Helvetica", 9)
    canvas.drawCentredString(page_w / 2, 78 * mm, "Print at 100% scale. Recheck sticker: 100 mm x 60 mm")
    # crack_label (point.structure_name) is dropped here: it is Chinese in real use and
    # Helvetica has no CJK glyphs, so it used to render as black boxes on the printed
    # sticker. The point id above already identifies the sticker.
    canvas.drawCentredString(
        page_w / 2, 72 * mm,
        f"{board.side} | Marker IDs: {', '.join(map(str, board.marker_ids))}",
    )
    canvas.drawCentredString(page_w / 2, 66 * mm, "Verify the 100 mm edge with a ruler before use.")
    canvas.drawCentredString(page_w / 2, 60 * mm, "Mount on a rigid backing. Both boards must be coplanar.")
    canvas.showPage()


def build_sticker_pdf(point_label: str, left: BoardSpec, right: BoardSpec) -> bytes:
    buffer = io.BytesIO()
    # pageCompression=0 keeps the label text readable in the raw bytes, which is what the
    # endpoint test asserts on. The file is ~1.4 KB either way.
    canvas = Canvas(buffer, pagesize=A4, pageCompression=0)
    _draw_board_page(canvas, point_label, left)
    _draw_board_page(canvas, point_label, right)
    canvas.save()
    return buffer.getvalue()
