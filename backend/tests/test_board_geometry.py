import numpy as np

from app.cv.board_geometry import DEMO_LEFT


def test_marker_geometry_is_board_centred() -> None:
    all_corners = np.concatenate(
        [DEMO_LEFT.marker_corners_mm(marker_id) for marker_id in DEMO_LEFT.marker_ids]
    )
    assert all_corners[:, 0].min() == -45.0
    assert all_corners[:, 0].max() == 45.0
    assert all_corners[:, 1].min() == -26.0
    assert all_corners[:, 1].max() == 26.0
    assert np.ptp(DEMO_LEFT.outer_corners_mm[:, 0]) == 100.0
    assert np.ptp(DEMO_LEFT.outer_corners_mm[:, 1]) == 60.0
