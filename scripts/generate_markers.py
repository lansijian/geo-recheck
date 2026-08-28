from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.board_geometry import DEMO_LEFT, DEMO_RIGHT  # noqa: E402
from app.services.sticker_pdf import board_png_bytes, build_sticker_pdf  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "markers")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for board in (DEMO_LEFT, DEMO_RIGHT):
        png_path = args.output / f"CRACK-W01_RECHECK_STICKER_{board.side}_V2.png"
        png_path.write_bytes(board_png_bytes(board))
        print(f"generated {png_path}")
    pdf_path = args.output / "CRACK-W01_RECHECK_STICKER_V2.pdf"
    pdf_path.write_bytes(build_sticker_pdf("MP-03", DEMO_LEFT, DEMO_RIGHT))
    print(f"generated {pdf_path}")


if __name__ == "__main__":
    main()
