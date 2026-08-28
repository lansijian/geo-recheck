from pathlib import Path

from app.cv.pipeline import measure_image
from app.cv.synthetic import CAMERA_MATRIX, DISTORTION, SyntheticCase, render_case


def test_synthetic_five_mm_measurement(tmp_path: Path) -> None:
    case = SyntheticCase("test", delta_mm=5.0, yaw_deg=20.0, pitch_deg=-7.0)
    image, truth = render_case(case, seed=99)
    result = measure_image(image, CAMERA_MATRIX, DISTORTION, tmp_path)
    assert result.status == "accepted", result.quality.reasons
    assert result.planar_position_mm is not None
    estimated_opening = result.planar_position_mm[0] - truth["baseline_right_center_mm"][0]
    assert abs(estimated_opening - truth["opening_delta_mm"]) <= 1.0
    assert result.dual_pnp_position_mm is not None
    assert result.measurement_mode == "planar_rectified_2d"
    assert (tmp_path / "overlay.png").exists()
    assert (tmp_path / "rectified.png").exists()


def test_blur_is_rejected() -> None:
    case = SyntheticCase(
        "blur", delta_mm=5.0, yaw_deg=10.0, blur_sigma=8.0, noise_sigma=0.0
    )
    image, _ = render_case(case, seed=100)
    result = measure_image(image, CAMERA_MATRIX, DISTORTION)
    assert result.status == "rejected"
    assert result.planar_position_mm is None
