from __future__ import annotations

from dataclasses import dataclass

import numpy as np


BOARD_SIZE_MM = 120.0
MARKER_SIZE_MM = 40.0
MARKER_INSET_MM = 10.0


@dataclass(frozen=True)
class BoardSpec:
    side: str
    marker_ids: tuple[int, int, int, int]

    def marker_corners_mm(self, marker_id: int) -> np.ndarray:
        """Return TL, TR, BR, BL marker corners in a board-centred frame."""
        index = self.marker_ids.index(marker_id)
        col = index % 2
        row = index // 2
        x0 = -BOARD_SIZE_MM / 2 + MARKER_INSET_MM + col * 60.0
        y0 = -BOARD_SIZE_MM / 2 + MARKER_INSET_MM + row * 60.0
        x1 = x0 + MARKER_SIZE_MM
        y1 = y0 + MARKER_SIZE_MM
        return np.asarray(
            [[x0, y0, 0.0], [x1, y0, 0.0], [x1, y1, 0.0], [x0, y1, 0.0]],
            dtype=np.float32,
        )

    @property
    def outer_corners_mm(self) -> np.ndarray:
        half = BOARD_SIZE_MM / 2
        return np.asarray(
            [[-half, -half], [half, -half], [half, half], [-half, half]],
            dtype=np.float32,
        )


DEMO_LEFT = BoardSpec("LEFT", (301, 302, 303, 304))
DEMO_RIGHT = BoardSpec("RIGHT", (305, 306, 307, 308))


def board_for_marker(marker_id: int) -> BoardSpec | None:
    for board in (DEMO_LEFT, DEMO_RIGHT):
        if marker_id in board.marker_ids:
            return board
    return None

