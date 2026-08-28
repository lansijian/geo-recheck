from pathlib import Path

from app.cv.board_geometry import BoardSpec
from app.cv.pipeline import measure_image, scan_marker_ids
from app.cv.synthetic import CAMERA_MATRIX, DISTORTION, SyntheticCase, render_case


CUSTOM_LEFT = BoardSpec("LEFT", (309, 310, 311, 312))
CUSTOM_RIGHT = BoardSpec("RIGHT", (313, 314, 315, 316))


def test_measures_a_non_demo_board_pair(tmp_path: Path) -> None:
    case = SyntheticCase("custom", delta_mm=5.0, yaw_deg=15.0)
    image, truth = render_case(case, seed=41, boards=(CUSTOM_LEFT, CUSTOM_RIGHT))

    result = measure_image(
        image, CAMERA_MATRIX, DISTORTION, tmp_path, left=CUSTOM_LEFT, right=CUSTOM_RIGHT
    )

    assert result.status == "accepted", result.quality.reasons
    assert result.planar_position_mm is not None
    estimated = result.planar_position_mm[0] - truth["baseline_right_center_mm"][0]
    assert abs(estimated - truth["opening_delta_mm"]) <= 1.0
    assert set(result.marker_ids) >= set(CUSTOM_LEFT.marker_ids + CUSTOM_RIGHT.marker_ids)


def test_demo_boards_still_work_without_explicit_arguments(tmp_path: Path) -> None:
    image, truth = render_case(SyntheticCase("demo", delta_mm=5.0, yaw_deg=15.0), seed=41)
    result = measure_image(image, CAMERA_MATRIX, DISTORTION, tmp_path)
    assert result.status == "accepted", result.quality.reasons
    estimated = result.planar_position_mm[0] - truth["baseline_right_center_mm"][0]
    assert abs(estimated - truth["opening_delta_mm"]) <= 1.0


def test_scan_marker_ids_reports_every_detected_tag() -> None:
    image, _ = render_case(
        SyntheticCase("scan", delta_mm=0.0, yaw_deg=0.0), seed=41, boards=(CUSTOM_LEFT, CUSTOM_RIGHT)
    )
    ids = scan_marker_ids(image, CAMERA_MATRIX, DISTORTION)
    assert set(ids) >= set(CUSTOM_LEFT.marker_ids + CUSTOM_RIGHT.marker_ids)
