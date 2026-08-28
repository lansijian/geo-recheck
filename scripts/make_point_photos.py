from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.board_geometry import BoardSpec  # noqa: E402
from app.cv.synthetic import SyntheticCase, render_case  # noqa: E402


def parse_ids(value: str) -> tuple[int, int, int, int]:
    items = tuple(int(item) for item in value.split(","))
    if len(items) != 4:
        raise argparse.ArgumentTypeError("每块复测贴必须提供 4 个 Marker ID。")
    return items


def write_case(path: Path, boards: tuple[BoardSpec, BoardSpec], delta: float, yaw: float, seed: int) -> None:
    image, _ = render_case(SyntheticCase(path.stem, delta_mm=delta, yaw_deg=yaw), seed=seed, boards=boards)
    if not cv2.imwrite(str(path), image):
        raise RuntimeError(f"无法写入 {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="为任意监测点生成不同角度的端到端测试照片。")
    parser.add_argument("--left", type=parse_ids, required=True)
    parser.add_argument("--right", type=parse_ids, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    boards = (BoardSpec("LEFT", args.left), BoardSpec("RIGHT", args.right))
    write_case(args.output / "baseline-angle-06.png", boards, 0.0, 6.0, 801)
    write_case(args.output / "recheck-angle-17.png", boards, 4.8, 17.0, 802)
    baseline = cv2.imread(str(args.output / "baseline-angle-06.png"))
    quality_fail = cv2.GaussianBlur(baseline, (41, 41), 0) if baseline is not None else np.full((900, 1400, 3), 190, dtype=np.uint8)
    cv2.imwrite(str(args.output / "quality-fail.png"), quality_fail)
    print(args.output)


if __name__ == "__main__":
    main()
