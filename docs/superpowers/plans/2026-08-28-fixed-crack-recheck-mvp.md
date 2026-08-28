# 固定裂缝复测 MVP (V0.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让操作者创建并管理多个固定裂缝监测点，系统自动分配标靶、生成可打印复测贴，并在基线建档后输出「较基线累计」与「较上次」两个毫米变化。

**Architecture:** 保持 React + FastAPI + SQLite 与既有 AprilTag 几何链路。先把 `measure_image()` 从写死的演示标靶解耦，再引入 `MarkerAssignment` 表把标靶唯一性变成主键约束，然后加入基线状态机与双数字，最后接上管理界面并把 V0.4 的 AI 现场复核泛化到真实点位。

**Tech Stack:** React 19、TypeScript、Vite 7、FastAPI、SQLAlchemy 2、SQLite、OpenCV `DICT_APRILTAG_36h11`、reportlab、pytest、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-28-fixed-crack-recheck-mvp-design.md`

## Global Constraints

- 不新增第三方运行时依赖。`reportlab` 与 `Pillow` 已在 `requirements.txt`，可在后端引用。
- 只输出相对位移。不输出风险等级、预警、撤离建议或绝对裂缝宽度结论。
- 所有真实墙体纹理必须保留来源、许可证与「受控合成」声明。
- macOS 与 Windows 都必须能启动开发环境并运行 E2E。
- 不提交 `.venv`、数据集、SQLite 数据库或生成的 benchmark 图片。
- **提交已获用户授权**：任务内的测试与全量回归全部通过后直接提交，无需再次询问；
  任何一项失败则不提交，报告失败内容。所有提交落在特性分支 `feat/fixed-crack-recheck-mvp`，
  不直接提交到 `main`。
- 后端测试命令统一为 `.venv/bin/python -m pytest`（Windows 为 `.venv\Scripts\python.exe -m pytest`）。
- V0.4 的一分钟演示与五个 Demo Case 在每个任务结束时都必须仍然可用。

---

## 文件结构

**T1 测量层解耦**
- `backend/app/cv/pipeline.py`：`measure_image()` 接受标靶规格；新增 `scan_marker_ids()`。
- `backend/app/cv/board_geometry.py`：删除无调用者的 `board_for_marker()`。
- `backend/app/cv/synthetic.py`：渲染器接受标靶规格，供测试构造非演示标靶场景。
- `backend/tests/test_pipeline_boards.py`：证明非演示标靶可完成测量。

**T2 标靶身份与点位数据模型**
- `backend/app/models/entities.py`：`MarkerAssignment` 表；`MonitorPoint` 与 `Inspection` 新增列。
- `backend/app/models/__init__.py`：导出新模型。
- `backend/app/db/session.py`：新增列的增量迁移 + `monitor_points` 表重建 + 标靶回填。
- `backend/app/services/registry.py`：标靶分配、点位创建、标靶反查、`boards_for_point()`。
- `backend/app/services/sticker_pdf.py`：从脚本抽出的复测贴排版逻辑。
- `scripts/generate_markers.py`：改为调用 `sticker_pdf`，保留命令行入口。
- `backend/app/main.py`：点位创建、详情、全景上传、复测贴下载接口。
- `backend/tests/conftest.py`：共享 fixture（点位清理、client、建点、合成照片、确认）。
- `backend/tests/test_point_lifecycle.py`：分配、唯一性、迁移、PDF。

**T3 基线状态机与双数字**
- `backend/app/services/inspection.py`：`capture_mode`、四个 delta、异常门收敛、堵回退。
- `backend/app/main.py`：基线采集接口；`/api/measure` 新增表单字段；确认时固化基线。
- `backend/tests/test_baseline_workflow.py`：状态机与双数字。

**T4 管理界面与跨平台**
- `frontend/src/pages/PointsPage.tsx`、`PointFormPage.tsx`、`PointDetailPage.tsx`：新建。
- `frontend/src/App.tsx`、`components/AppShell.tsx`：路由与导航。
- `frontend/src/api/client.ts`、`types.ts`：点位 API 与类型。
- `frontend/src/pages/ResultPage.tsx`、`RecordPage.tsx`、`CapturePage.tsx`：绑定点位上下文。
- `frontend/e2e/helpers.ts`：新建，跨平台 Python 路径解析。
- `frontend/e2e/golden-path.spec.ts`、`repeatability.spec.ts`：改用 helper。
- `frontend/e2e/point-lifecycle.spec.ts`：新建，点位生命周期验收。
- `scripts/run_dev.py`：按平台选择 npm 可执行文件。
- `docs/MACOS.md`：更新 E2E 说明。

**T5 AI 复核泛化**
- `backend/app/services/ai_review.py`：`ReviewImages` 与 `resolve_review_images()`。
- `backend/app/config.py`：`CONTEXT_PHOTO_STALE_DAYS`。
- `backend/app/main.py`：AI 复核接口支持真实点位。
- `frontend/src/pages/ResultPage.tsx`、`PointDetailPage.tsx`：全景过期提示。
- `backend/tests/test_ai_review_real_point.py`：真实点位取图与基线禁用。
- `docs/VALIDATION.md`：受控验证表述边界。

---

### Task 1: 测量层按点位参数化

`measure_image()` 目前在 `pipeline.py` 第 59、60、87、88 行写死 `DEMO_LEFT` 与 `DEMO_RIGHT`，
即只测量标靶 301–308。任何新建点位都无法产出测量结果。本任务在引入点位之前先解除该限制。

**Files:**
- Modify: `backend/app/cv/synthetic.py`
- Modify: `backend/app/cv/pipeline.py`
- Modify: `backend/app/cv/board_geometry.py`
- Create: `backend/tests/test_pipeline_boards.py`

**Interfaces:**
- Produces: `scan_marker_ids(image: np.ndarray, camera_matrix: np.ndarray, distortion: np.ndarray) -> list[int]`
- Produces: `measure_image(image, camera_matrix, distortion, output_dir=None, left: BoardSpec = DEMO_LEFT, right: BoardSpec = DEMO_RIGHT) -> MeasurementResult`
- Produces: `render_case(case, *, baseline_mm=..., dataset_root=None, seed=7, boards: tuple[BoardSpec, BoardSpec] = (DEMO_LEFT, DEMO_RIGHT)) -> tuple[np.ndarray, dict]`
- Produces: `build_canonical_wall_plane(opening_delta_mm, shear_delta_mm, dataset_root, seed, occlusion, scene_index=0, surface_change="none", boards=(DEMO_LEFT, DEMO_RIGHT))`

- [ ] **Step 1: 写失败测试 —— 非演示标靶必须能测出结果**

Create `backend/tests/test_pipeline_boards.py`:

```python
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `.venv/bin/python -m pytest backend/tests/test_pipeline_boards.py -q`

Expected: FAIL。`render_case()` 报 `unexpected keyword argument 'boards'`，
且 `scan_marker_ids` 无法从 `app.cv.pipeline` 导入。

- [ ] **Step 3: 让合成渲染器接受标靶规格**

In `backend/app/cv/synthetic.py`, change `build_canonical_wall_plane` (currently line 282)
to take a `boards` keyword and use it at the two `_paste_texture` calls:

```python
def build_canonical_wall_plane(
    opening_delta_mm: float,
    shear_delta_mm: float,
    dataset_root: Path | None,
    seed: int,
    occlusion: str,
    scene_index: int = 0,
    surface_change: str = "none",
    boards: tuple[BoardSpec, BoardSpec] = (DEMO_LEFT, DEMO_RIGHT),
) -> tuple[np.ndarray, dict]:
    left_board, right_board = boards
    ...
    _paste_texture(wall, make_board_texture(left_board, SYNTHETIC_PIXELS_PER_MM), (split_x - half_separation_px, center_y))
    _paste_texture(wall, make_board_texture(right_board, SYNTHETIC_PIXELS_PER_MM), (split_x + half_separation_px, center_y))
```

Then thread it through `render_case` (currently line 335):

```python
def render_case(
    case: SyntheticCase,
    *,
    baseline_mm: float = BASELINE_BOARD_SEPARATION_MM,
    dataset_root: Path | None = None,
    seed: int = 7,
    boards: tuple[BoardSpec, BoardSpec] = (DEMO_LEFT, DEMO_RIGHT),
) -> tuple[np.ndarray, dict]:
    del baseline_mm
    plane, physical = build_canonical_wall_plane(
        case.delta_mm,
        case.shear_delta_mm,
        dataset_root,
        seed,
        case.occlusion,
        case.scene_index,
        case.surface_change,
        boards,
    )
```

- [ ] **Step 4: 让 `measure_image()` 接受标靶规格并新增 `scan_marker_ids()`**

In `backend/app/cv/pipeline.py`, add the scan helper above `measure_image`:

```python
def scan_marker_ids(
    image: np.ndarray, camera_matrix: np.ndarray, distortion: np.ndarray
) -> list[int]:
    """Cheap identity pass: which tags are in frame, before boards are known."""
    undistorted = cv2.undistort(image, camera_matrix, distortion)
    return DEFAULT_DETECTOR.detect(undistorted).ids
```

Change the signature and the four hardcoded references:

```python
def measure_image(
    image: np.ndarray,
    camera_matrix: np.ndarray,
    distortion: np.ndarray,
    output_dir: Path | None = None,
    left: BoardSpec = DEMO_LEFT,
    right: BoardSpec = DEMO_RIGHT,
) -> MeasurementResult:
    undistorted = cv2.undistort(image, camera_matrix, distortion)
    detection = DEFAULT_DETECTOR.detect(undistorted)
    left_pose = estimate_board_pose(left, detection.corners_by_id, camera_matrix, distortion)
    right_pose = estimate_board_pose(right, detection.corners_by_id, camera_matrix, distortion)
    quality = assess_quality(undistorted, detection.corners_by_id, left_pose, right_pose)
    planar = measure_planar_relative(
        detection.corners_by_id,
        left=left,
        right=right,
        left_pose=left_pose,
        camera_matrix=camera_matrix,
    )
```

Rename the local `left`/`right` pose variables to `left_pose`/`right_pose` throughout the
function body (they are used at the `distance`, `dual_pnp`, overlay and return sites), and
change the two rectification calls:

```python
        left_rect = rectify_board(undistorted, left, detection.corners_by_id)
        right_rect = rectify_board(undistorted, right, detection.corners_by_id)
```

Update the import at line 9 to also bring in `BoardSpec`:

```python
from .board_geometry import DEMO_LEFT, DEMO_RIGHT, BoardSpec
```

- [ ] **Step 5: 删除无调用者的 `board_for_marker()`**

In `backend/app/cv/board_geometry.py`, delete the function at lines 53–57. It has no callers
anywhere in the repository and embeds the "only two demo boards exist" assumption in the
geometry layer.

- [ ] **Step 6: 运行新测试确认通过**

Run: `.venv/bin/python -m pytest backend/tests/test_pipeline_boards.py -q`

Expected: PASS，3 项全过。

- [ ] **Step 7: 运行全量后端回归，确认既有八处调用点未受影响**

Run: `.venv/bin/python -m pytest -q`

Expected: 全部通过。`test_synthetic_pipeline.py`、`test_api_workflow.py`、`test_ai_review.py`
都不修改即通过，证明默认参数保持了向后兼容。

- [ ] **Step 8: 提交**

```bash
git add backend/app/cv/pipeline.py backend/app/cv/board_geometry.py backend/app/cv/synthetic.py backend/tests/test_pipeline_boards.py
git commit -m "feat: measure arbitrary board pairs instead of hardcoded demo tags"
```

---

### Task 2: 标靶身份、自动分配与点位数据模型

把「标靶 ID 全局唯一」从函数校验变成主键约束，并让建点时自动分配连续空闲 ID、
产出可打印复测贴。

**Files:**
- Modify: `backend/app/models/entities.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/db/session.py`
- Modify: `backend/app/services/registry.py`
- Create: `backend/app/services/sticker_pdf.py`
- Modify: `scripts/generate_markers.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_point_lifecycle.py`

**Interfaces:**
- Consumes: `BoardSpec` from `app.cv.board_geometry`（T1 已确认可用于任意 ID）
- Produces: `allocate_marker_block(session: Session) -> list[int]`，返回八个连续空闲 ID
- Produces: `create_monitor_point(session: Session, payload: PointCreatePayload) -> MonitorPoint`
- Produces: `boards_for_point(point: MonitorPoint) -> tuple[BoardSpec, BoardSpec]`
- Produces: `match_point(session: Session, detected_ids: list[int]) -> MonitorPoint | None`（重写，签名不变）
- Produces: `point_to_dict(point: MonitorPoint) -> dict`（签名不变，改为从 `point.marker_assignments` 读取）
- Produces: `build_sticker_pdf(point_label: str, crack_label: str, left: BoardSpec, right: BoardSpec) -> bytes`
- Produces: `MonitorPoint.marker_assignments: list[MarkerAssignment]`，按 `slot` 排序，`lazy="selectin"`

- [ ] **Step 1: 建立共享测试脚手架**

The whole suite shares one SQLite file and `TestClient(app)` seeds it through the app
lifespan. Without cleanup, a second run of this task's tests fails with
「监测点编号已存在」and leaks marker ids — which looks like an implementation bug but is not.
`backend/tests/__init__.py` does not exist, so test modules must not import each other;
shared helpers therefore live in `conftest.py` as fixtures.

Create `backend/tests/conftest.py`:

```python
from __future__ import annotations

import cv2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.cv.board_geometry import BoardSpec
from app.cv.synthetic import SyntheticCase, render_case
from app.db.session import SessionLocal
from app.main import app
from app.models import Inspection, MarkerAssignment, MonitorPoint
from app.services.registry import boards_for_point


TEST_POINT_PREFIXES = ("MP-T", "MP-BL", "MP-AI")


@pytest.fixture(autouse=True)
def clean_test_points():
    """Points created by tests must not survive into the next run."""
    yield
    with SessionLocal() as session:
        ids = [
            point.monitor_point_id
            for point in session.query(MonitorPoint).all()
            if point.monitor_point_id.startswith(TEST_POINT_PREFIXES)
        ]
        if not ids:
            return
        session.execute(delete(Inspection).where(Inspection.monitor_point_id.in_(ids)))
        session.execute(
            delete(MarkerAssignment).where(MarkerAssignment.monitor_point_id.in_(ids))
        )
        session.execute(delete(MonitorPoint).where(MonitorPoint.monitor_point_id.in_(ids)))
        session.commit()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def point_payload():
    def build(point_id: str, name: str = "测试墙缝") -> dict:
        return {
            "monitor_point_id": point_id,
            "hazard_id": "HZ-TEST-001",
            "hazard_name": "测试隐患点",
            "monitor_point_name": name,
            "structure_id": "WALL-TEST",
            "structure_name": "测试墙体",
            "location_description": "测试位置描述",
        }

    return build


@pytest.fixture
def make_point(client, point_payload):
    def build(point_id: str) -> tuple[BoardSpec, BoardSpec]:
        response = client.post("/api/points", json=point_payload(point_id))
        assert response.status_code == 200, response.text
        with SessionLocal() as session:
            return boards_for_point(session.get(MonitorPoint, point_id))

    return build


@pytest.fixture
def crack_photo():
    def build(boards: tuple[BoardSpec, BoardSpec], delta_mm: float) -> bytes:
        image, _ = render_case(
            SyntheticCase("fixture", delta_mm=delta_mm, yaw_deg=10.0), seed=55, boards=boards
        )
        encoded, buffer = cv2.imencode(".png", image)
        assert encoded
        return buffer.tobytes()

    return build


@pytest.fixture
def confirm_inspection(client):
    def build(inspection_id: str) -> dict:
        response = client.post(
            f"/api/inspections/{inspection_id}/confirm",
            json={"observer_name": "测试监测员"},
        )
        assert response.status_code == 200, response.text
        return response.json()

    return build
```

`crack_photo` depends on `render_case(..., boards=)` from T1, so T1 must be complete first.

- [ ] **Step 2: 写失败测试 —— 分配、唯一性与 PDF**

Create `backend/tests/test_point_lifecycle.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models import MarkerAssignment, MonitorPoint
from app.services.registry import allocate_marker_block, boards_for_point


def test_allocates_a_free_block_and_never_hands_out_seeded_ids(client, point_payload):
    created = client.post("/api/points", json=point_payload("MP-T01"))
    assert created.status_code == 200, created.text
    body = created.json()
    allocated = body["left_marker_group"] + body["right_marker_group"]
    assert len(allocated) == 8
    assert allocated == sorted(allocated)
    # 301-308 belong to the seeded demo point MP-03 and must not be handed out.
    assert not set(allocated) & {301, 302, 303, 304, 305, 306, 307, 308}


def test_second_point_gets_a_disjoint_block(client, point_payload):
    first = client.post("/api/points", json=point_payload("MP-T02")).json()
    second = client.post("/api/points", json=point_payload("MP-T03")).json()
    first_ids = set(first["left_marker_group"] + first["right_marker_group"])
    second_ids = set(second["left_marker_group"] + second["right_marker_group"])
    assert not first_ids & second_ids


def test_duplicate_point_id_is_refused(client, point_payload):
    assert client.post("/api/points", json=point_payload("MP-T07")).status_code == 200
    again = client.post("/api/points", json=point_payload("MP-T07"))
    assert again.status_code == 422
    assert "已存在" in again.json()["detail"]


def test_duplicate_marker_id_is_refused_by_the_database(client, point_payload):
    client.post("/api/points", json=point_payload("MP-T04"))
    with SessionLocal() as session:
        existing = session.query(MarkerAssignment).first()
        assert existing is not None
        session.add(
            MarkerAssignment(
                marker_id=existing.marker_id,
                monitor_point_id="MP-T04",
                side="left",
                slot=0,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_boards_for_point_preserves_slot_order(client, point_payload):
    body = client.post("/api/points", json=point_payload("MP-T05")).json()
    with SessionLocal() as session:
        point = session.get(MonitorPoint, "MP-T05")
        left, right = boards_for_point(point)
        assert list(left.marker_ids) == body["left_marker_group"]
        assert list(right.marker_ids) == body["right_marker_group"]
        assert left.side == "LEFT" and right.side == "RIGHT"


def test_sticker_pdf_contains_the_point_and_its_marker_ids(client, point_payload):
    body = client.post("/api/points", json=point_payload("MP-T06")).json()
    response = client.get("/api/points/MP-T06/sticker.pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    text = response.content.decode("latin-1")
    assert "MP-T06" in text
    for marker_id in body["left_marker_group"]:
        assert str(marker_id) in text


def test_seeded_demo_point_still_reads_back_its_markers(client):
    response = client.get("/api/points/MP-03")
    assert response.status_code == 200
    body = response.json()
    assert body["left_marker_group"] == [301, 302, 303, 304]
    assert body["right_marker_group"] == [305, 306, 307, 308]
    assert body["baseline_status"] in {"missing", "confirmed"}


def test_allocation_is_contiguous_within_a_point():
    with SessionLocal() as session:
        block = allocate_marker_block(session)
        assert len(block) == 8
        assert block == list(range(block[0], block[0] + 8))
```

- [ ] **Step 3: 运行测试确认失败**

Run: `.venv/bin/python -m pytest backend/tests/test_point_lifecycle.py -q`

Expected: FAIL。`POST /api/points` 返回 405（该路径目前只有 GET），
且 `app.models` 无 `MarkerAssignment`。

- [ ] **Step 4: 新增模型与列**

In `backend/app/models/entities.py`, add the import and the new table:

```python
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class MarkerAssignment(Base):
    __tablename__ = "marker_assignments"

    marker_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_point_id: Mapped[str] = mapped_column(
        ForeignKey("monitor_points.monitor_point_id"), index=True
    )
    side: Mapped[str] = mapped_column(String(8))
    slot: Mapped[int] = mapped_column(Integer)

    point: Mapped["MonitorPoint"] = relationship(back_populates="marker_assignments")
```

On `MonitorPoint`, make latitude/longitude nullable, add the new columns, and add the
relationship. `lazy="selectin"` keeps `point_to_dict(point)` a one-argument function.

```python
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_mm: Mapped[float] = mapped_column(Float)  # legacy: board-centre distance, write-only
    left_marker_group: Mapped[str] = mapped_column(String(100))   # legacy: derived, never read
    right_marker_group: Mapped[str] = mapped_column(String(100))  # legacy: derived, never read
    baseline_inspection_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    context_photo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    context_photo_captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    context_callouts: Mapped[str | None] = mapped_column(Text, nullable=True)

    marker_assignments: Mapped[list["MarkerAssignment"]] = relationship(
        back_populates="point",
        order_by="MarkerAssignment.slot",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
```

On `Inspection`, add the columns T3 and T5 will populate:

```python
    capture_mode: Mapped[str] = mapped_column(String(16), default="recheck")
    planar_x_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    planar_y_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    opening_since_baseline_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    shear_since_baseline_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    camera_profile_is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    context_photo_used: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

In `backend/app/models/__init__.py`, export `MarkerAssignment` alongside the existing names.

- [ ] **Step 5: 写迁移 —— 增量列、表重建与标靶回填**

In `backend/app/db/session.py`, add the new column maps and the rebuild:

```python
V05_INSPECTION_COLUMNS = {
    "capture_mode": "VARCHAR(16)",
    "planar_x_mm": "FLOAT",
    "planar_y_mm": "FLOAT",
    "opening_since_baseline_mm": "FLOAT",
    "shear_since_baseline_mm": "FLOAT",
    "camera_profile_is_demo": "BOOLEAN",
    "context_photo_used": "VARCHAR(500)",
}

V05_POINT_COLUMNS = {
    "baseline_inspection_id": "VARCHAR(36)",
    "context_photo_path": "VARCHAR(500)",
    "context_photo_captured_at": "DATETIME",
    "context_callouts": "TEXT",
}

LEGACY_POINT_COLUMNS = (
    "monitor_point_id, hazard_id, hazard_name, monitor_point_name, structure_id, "
    "structure_name, location_description, latitude, longitude, elevation, "
    "baseline_mm, left_marker_group, right_marker_group, is_demo_location"
)


def _add_missing_columns(connection, table: str, columns: dict[str, str]) -> None:
    existing = {column["name"] for column in inspect(engine).get_columns(table)}
    for name, sql_type in columns.items():
        if name not in existing:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


def _monitor_points_need_rebuild() -> bool:
    """The legacy schema declared latitude/longitude NOT NULL; new points may have neither."""
    for column in inspect(engine).get_columns("monitor_points"):
        if column["name"] == "latitude":
            return not column["nullable"]
    return False


def _rebuild_monitor_points(connection) -> None:
    connection.execute(text("ALTER TABLE monitor_points RENAME TO monitor_points_legacy"))
    # SQLite does not rename a table's indexes along with the table itself, so the old
    # named index (e.g. ix_monitor_points_hazard_id) stays attached to *_legacy and
    # would collide with the identically-named index the fresh CREATE TABLE defines below.
    stale_indexes = connection.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type = 'index' "
            "AND tbl_name = 'monitor_points_legacy' AND name NOT LIKE 'sqlite_autoindex_%'"
        )
    ).scalars().all()
    for index_name in stale_indexes:
        connection.execute(text(f"DROP INDEX {index_name}"))
    Base.metadata.tables["monitor_points"].create(bind=connection)
    connection.execute(
        text(
            f"INSERT INTO monitor_points ({LEGACY_POINT_COLUMNS}) "
            f"SELECT {LEGACY_POINT_COLUMNS} FROM monitor_points_legacy"
        )
    )
    connection.execute(text("DROP TABLE monitor_points_legacy"))


def _backfill_marker_assignments(connection) -> None:
    """One-time move of the comma-separated groups into the uniqueness-bearing table."""
    rows = connection.execute(
        text("SELECT monitor_point_id, left_marker_group, right_marker_group FROM monitor_points")
    ).all()
    for point_id, left_group, right_group in rows:
        for side, group in (("left", left_group), ("right", right_group)):
            for slot, raw in enumerate(item for item in (group or "").split(",") if item):
                connection.execute(
                    text(
                        "INSERT OR IGNORE INTO marker_assignments "
                        "(marker_id, monitor_point_id, side, slot) "
                        "VALUES (:marker_id, :point_id, :side, :slot)"
                    ),
                    {"marker_id": int(raw), "point_id": point_id, "side": side, "slot": slot},
                )


def migrate_schema() -> None:
    """Additive migration plus a guarded rebuild so an existing SQLite file stays usable."""
    with engine.begin() as connection:
        _add_missing_columns(
            connection, "inspections",
            {**V03_INSPECTION_COLUMNS, **V04_INSPECTION_COLUMNS, **V05_INSPECTION_COLUMNS},
        )
        _add_missing_columns(connection, "monitor_points", V05_POINT_COLUMNS)
        if _monitor_points_need_rebuild():
            _rebuild_monitor_points(connection)
        _backfill_marker_assignments(connection)
```

`Base.metadata.create_all()` in `main.py`'s lifespan already runs before `migrate_schema()`,
so `marker_assignments` exists by the time the backfill runs.

- [ ] **Step 6: 实现分配、创建、反查与板规格**

Rewrite `backend/app/services/registry.py`:

```python
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_ROOT
from app.cv.board_geometry import BoardSpec
from app.models import MarkerAssignment, MonitorPoint


MARKER_ID_MIN = 0
MARKER_ID_MAX = 586          # DICT_APRILTAG_36h11 holds 587 markers
MARKERS_PER_POINT = 8


def marker_ids(value: str) -> list[int]:
    return [int(item) for item in value.split(",") if item]


def _side_ids(point: MonitorPoint, side: str) -> list[int]:
    return [item.marker_id for item in point.marker_assignments if item.side == side]


def boards_for_point(point: MonitorPoint) -> tuple[BoardSpec, BoardSpec]:
    left = _side_ids(point, "left")
    right = _side_ids(point, "right")
    if len(left) != 4 or len(right) != 4:
        raise ValueError(f"监测点 {point.monitor_point_id} 的标靶配置不完整。")
    return BoardSpec("LEFT", tuple(left)), BoardSpec("RIGHT", tuple(right))


def allocate_marker_block(session: Session) -> list[int]:
    """Lowest contiguous run of free ids, so gaps from deleted points get reused."""
    taken = set(session.scalars(select(MarkerAssignment.marker_id)).all())
    for start in range(MARKER_ID_MIN, MARKER_ID_MAX - MARKERS_PER_POINT + 2):
        block = list(range(start, start + MARKERS_PER_POINT))
        if not taken.intersection(block):
            return block
    raise ValueError("标靶 ID 已用尽，无法再创建监测点。")


def create_monitor_point(session: Session, payload) -> MonitorPoint:
    if session.get(MonitorPoint, payload.monitor_point_id) is not None:
        raise ValueError(f"监测点编号 {payload.monitor_point_id} 已存在。")
    block = allocate_marker_block(session)
    left_ids, right_ids = block[:4], block[4:]
    point = MonitorPoint(
        monitor_point_id=payload.monitor_point_id,
        hazard_id=payload.hazard_id,
        hazard_name=payload.hazard_name,
        monitor_point_name=payload.monitor_point_name,
        structure_id=payload.structure_id,
        structure_name=payload.structure_name,
        location_description=payload.location_description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elevation=payload.elevation,
        baseline_mm=0.0,
        left_marker_group=",".join(map(str, left_ids)),
        right_marker_group=",".join(map(str, right_ids)),
        is_demo_location=False,
    )
    session.add(point)
    for side, ids in (("left", left_ids), ("right", right_ids)):
        for slot, marker_id in enumerate(ids):
            session.add(
                MarkerAssignment(
                    marker_id=marker_id,
                    monitor_point_id=point.monitor_point_id,
                    side=side,
                    slot=slot,
                )
            )
    session.commit()
    session.refresh(point)
    return point


def point_to_dict(point: MonitorPoint) -> dict:
    return {
        "hazard_id": point.hazard_id,
        "hazard_name": point.hazard_name,
        "monitor_point_id": point.monitor_point_id,
        "monitor_point_name": point.monitor_point_name,
        "structure_id": point.structure_id,
        "structure_name": point.structure_name,
        "location_description": point.location_description,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "elevation": point.elevation,
        "baseline_mm": point.baseline_mm,
        "left_marker_group": _side_ids(point, "left"),
        "right_marker_group": _side_ids(point, "right"),
        "is_demo_location": point.is_demo_location,
        "baseline_inspection_id": point.baseline_inspection_id,
        "baseline_status": "confirmed" if point.baseline_inspection_id else "missing",
        "context_photo_path": point.context_photo_path,
        "context_photo_captured_at": (
            point.context_photo_captured_at.isoformat()
            if point.context_photo_captured_at
            else None
        ),
    }


def seed_points(session: Session) -> None:
    payload = json.loads((SEED_ROOT / "point_registry.json").read_text(encoding="utf-8"))
    for record in payload:
        point = session.get(MonitorPoint, record["monitor_point_id"])
        if point is None:
            point = MonitorPoint(monitor_point_id=record["monitor_point_id"])
            session.add(point)
        for key, value in record.items():
            if key in {"left_marker_group", "right_marker_group", "monitor_point_id"}:
                continue
            setattr(point, key, value)
        point.left_marker_group = ",".join(map(str, record["left_marker_group"]))
        point.right_marker_group = ",".join(map(str, record["right_marker_group"]))
        session.flush()
        for side, key in (("left", "left_marker_group"), ("right", "right_marker_group")):
            for slot, marker_id in enumerate(record[key]):
                if session.get(MarkerAssignment, marker_id) is None:
                    session.add(
                        MarkerAssignment(
                            marker_id=marker_id,
                            monitor_point_id=point.monitor_point_id,
                            side=side,
                            slot=slot,
                        )
                    )
    session.commit()


def match_point(session: Session, detected_ids: list[int]) -> MonitorPoint | None:
    """A point is identified by its tags: ids are globally unique by primary key."""
    if not detected_ids:
        return None
    rows = session.scalars(
        select(MarkerAssignment).where(MarkerAssignment.marker_id.in_(detected_ids))
    ).all()
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        counts.setdefault(row.monitor_point_id, {"left": 0, "right": 0})[row.side] += 1
    for point_id, tally in counts.items():
        if tally["left"] >= 3 and tally["right"] >= 3:
            return session.get(MonitorPoint, point_id)
    return None
```

- [ ] **Step 7: 抽出复测贴排版并保留脚本入口**

Create `backend/app/services/sticker_pdf.py`:

```python
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


def _draw_board_page(canvas: Canvas, point_label: str, crack_label: str, board: BoardSpec) -> None:
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
    canvas.drawCentredString(
        page_w / 2, 72 * mm,
        f"{crack_label} {board.side} | Marker IDs: {', '.join(map(str, board.marker_ids))}",
    )
    canvas.drawCentredString(page_w / 2, 66 * mm, "Verify the 100 mm edge with a ruler before use.")
    canvas.drawCentredString(page_w / 2, 60 * mm, "Mount on a rigid backing. Both boards must be coplanar.")
    canvas.showPage()


def build_sticker_pdf(
    point_label: str, crack_label: str, left: BoardSpec, right: BoardSpec
) -> bytes:
    buffer = io.BytesIO()
    # pageCompression=0 keeps the label text readable in the raw bytes, which is what the
    # endpoint test asserts on. The file is ~1.4 KB either way.
    canvas = Canvas(buffer, pagesize=A4, pageCompression=0)
    _draw_board_page(canvas, point_label, crack_label, left)
    _draw_board_page(canvas, point_label, crack_label, right)
    canvas.save()
    return buffer.getvalue()
```

Rewrite `scripts/generate_markers.py` to reuse it, keeping the CLI:

```python
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
    pdf_path.write_bytes(build_sticker_pdf("MP-03", "CRACK-W01", DEMO_LEFT, DEMO_RIGHT))
    print(f"generated {pdf_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: 新增点位接口**

In `backend/app/main.py`, add the payload model near `ConfirmationPayload`:

```python
class PointCreatePayload(BaseModel):
    monitor_point_id: str = Field(min_length=1, max_length=64)
    hazard_id: str = Field(min_length=1, max_length=64)
    hazard_name: str = Field(min_length=1, max_length=200)
    monitor_point_name: str = Field(min_length=1, max_length=200)
    structure_id: str = Field(min_length=1, max_length=64)
    structure_name: str = Field(min_length=1, max_length=200)
    location_description: str = Field(min_length=1, max_length=300)
    latitude: float | None = None
    longitude: float | None = None
    elevation: float | None = None
```

Add the endpoints, importing `boards_for_point`, `create_monitor_point` from the registry
and `build_sticker_pdf` from the new service, plus `Response` from fastapi:

```python
@app.post("/api/points")
def create_point(payload: PointCreatePayload, session: Session = Depends(get_db)) -> dict:
    try:
        point = create_monitor_point(session, payload)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return point_to_dict(point)


@app.get("/api/points/{monitor_point_id}/sticker.pdf")
def point_sticker_pdf(monitor_point_id: str, session: Session = Depends(get_db)) -> Response:
    point = session.get(MonitorPoint, monitor_point_id)
    if point is None:
        raise HTTPException(404, "监测点不存在。")
    try:
        left, right = boards_for_point(point)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    pdf = build_sticker_pdf(point.monitor_point_id, point.structure_name, left, right)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{monitor_point_id}_sticker.pdf"'
        },
    )


@app.put("/api/points/{monitor_point_id}/context-photo")
async def upload_context_photo(
    monitor_point_id: str,
    image: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> dict:
    point = session.get(MonitorPoint, monitor_point_id)
    if point is None:
        raise HTTPException(404, "监测点不存在。")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(415, "仅支持图片文件。")
    raw = await image.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 20 MB。")
    target_dir = EVIDENCE_ROOT / "points" / monitor_point_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "context.jpg"
    target.write_bytes(raw)
    point.context_photo_path = f"/media/points/{monitor_point_id}/context.jpg"
    point.context_photo_captured_at = datetime.now()
    session.commit()
    return point_to_dict(point)
```

Add `from datetime import datetime` and `from fastapi import Response` to the imports.

Also extend the existing `list_points` response so the management list has what it needs:

```python
        response.append(
            {
                **point_to_dict(point),
                "last_capture_time": last.capture_time.isoformat() if last else None,
                "last_distance_mm": last.current_distance_mm if last else point.baseline_mm,
                "demo_ready": point.monitor_point_id == "MP-03",
            }
        )
```

（`point_to_dict` 已包含 `baseline_status`，无需额外字段。）

- [ ] **Step 9: 运行点位测试**

Run: `.venv/bin/python -m pytest backend/tests/test_point_lifecycle.py -q`

Expected: PASS，7 项全过。

- [ ] **Step 10: 运行全量回归，确认 seed 与既有 API 未受影响**

Run: `.venv/bin/python -m pytest -q`

Expected: 全部通过。若 `test_api_workflow.py` 因数据库残留失败，先删除 `data/geo_recheck.db`
再重跑，确认迁移在空库与旧库上都成立。

- [ ] **Step 11: 在既有旧库上验证迁移不丢数据**

Run:

```bash
cp data/geo_recheck.db /tmp/geo_recheck_before.db
.venv/bin/python -c "
from app.db.session import SessionLocal
from app.models import MonitorPoint, MarkerAssignment
with SessionLocal() as s:
    print('points', s.query(MonitorPoint).count())
    print('assignments', s.query(MarkerAssignment).count())
"
```

Expected: `points` 不少于 1，`assignments` 为 `points × 8`，MP-03 的 301–308 已回填。

- [ ] **Step 12: 提交**

```bash
git add backend/app/models backend/app/db/session.py backend/app/services/registry.py backend/app/services/sticker_pdf.py backend/app/main.py scripts/generate_markers.py backend/tests/conftest.py backend/tests/test_point_lifecycle.py
git commit -m "feat: allocate unique marker blocks per point and emit printable stickers"
```

---

### Task 3: 基线状态机与双数字

**Files:**
- Modify: `backend/app/services/inspection.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_baseline_workflow.py`

**Interfaces:**
- Consumes: `boards_for_point(point)`、`match_point(session, ids)`（T2）
- Consumes: `scan_marker_ids(image, camera_matrix, distortion)`、`measure_image(..., left, right)`（T1）
- Produces: `last_confirmed_inspection(session, monitor_point_id, before: datetime | None = None) -> Inspection | None`
- Produces: `create_measurement(session, raw_image, browser_lat, browser_lon, original_filename="measurement.png", demo_case_id=None, monitor_point_id: str | None = None, capture_mode: str = "recheck") -> dict`
- Produces: `POST /api/points/{id}/baseline`
- Produces: 响应字段 `opening_delta_mm`（较上次）、`opening_since_baseline_mm`（较基线）、
  `shear_delta_mm`、`shear_since_baseline_mm`、`capture_mode`、`camera_profile_is_demo`

- [ ] **Step 1: 写失败测试 —— 状态机、双数字与防回退**

Create `backend/tests/test_baseline_workflow.py`:

Uses the `client`, `make_point`, `crack_photo` and `confirm_inspection` fixtures from
`backend/tests/conftest.py` (created in T2 Step 1).

```python
from app.db.session import SessionLocal
from app.models import Inspection


def test_recheck_before_baseline_is_refused(client, make_point, crack_photo):
    boards = make_point("MP-BL01")
    response = client.post(
        "/api/measure",
        files={"image": ("a.png", crack_photo(boards, 0.0), "image/png")},
        data={"point": "MP-BL01", "capture_mode": "recheck"},
    )
    assert response.status_code == 422
    assert "建档" in response.json()["detail"]


def test_baseline_then_recheck_reports_both_numbers(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-BL02")

    baseline = client.post(
        "/api/points/MP-BL02/baseline",
        files={"image": ("base.png", crack_photo(boards, 0.0), "image/png")},
    )
    assert baseline.status_code == 200, baseline.text
    assert baseline.json()["capture_mode"] == "baseline"
    assert baseline.json()["opening_since_baseline_mm"] == 0.0
    confirm_inspection(baseline.json()["id"])

    first = client.post(
        "/api/measure",
        files={"image": ("c1.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL02", "capture_mode": "recheck"},
    ).json()
    confirm_inspection(first["id"])
    assert abs(first["opening_since_baseline_mm"] - 2.0) <= 1.0
    assert abs(first["opening_delta_mm"] - 2.0) <= 1.0

    second = client.post(
        "/api/measure",
        files={"image": ("c2.png", crack_photo(boards, 5.0), "image/png")},
        data={"point": "MP-BL02", "capture_mode": "recheck"},
    ).json()
    # cumulative is measured from the baseline, single-period from the last confirmed run
    assert abs(second["opening_since_baseline_mm"] - 5.0) <= 1.0
    assert abs(second["opening_delta_mm"] - 3.0) <= 1.0


def test_explicit_point_mismatch_is_refused_and_never_falls_back(
    client, make_point, crack_photo, confirm_inspection
):
    boards_a = make_point("MP-BL03")
    make_point("MP-BL04")
    baseline = client.post(
        "/api/points/MP-BL03/baseline",
        files={"image": ("b.png", crack_photo(boards_a, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])

    response = client.post(
        "/api/measure",
        files={"image": ("x.png", crack_photo(boards_a, 2.0), "image/png")},
        data={"point": "MP-BL04", "capture_mode": "recheck"},
    )
    assert response.status_code == 422
    assert "MP-BL03" in response.json()["detail"]


def test_second_baseline_is_refused(client, make_point, crack_photo, confirm_inspection):
    boards = make_point("MP-BL05")
    first = client.post(
        "/api/points/MP-BL05/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(first["id"])
    again = client.post(
        "/api/points/MP-BL05/baseline",
        files={"image": ("b2.png", crack_photo(boards, 0.0), "image/png")},
    )
    assert again.status_code == 422
    assert "已建档" in again.json()["detail"]


def test_cumulative_value_is_not_capped_by_the_single_period_gate(
    client, make_point, crack_photo, confirm_inspection
):
    """A long-tracked crack legitimately exceeds 50 mm cumulatively."""
    boards = make_point("MP-BL06")
    baseline = client.post(
        "/api/points/MP-BL06/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])

    # Confirm one recheck first. Without it `previous` IS the baseline row, the two deltas
    # are numerically identical, and the test cannot distinguish the gate's two subjects.
    first = client.post(
        "/api/measure",
        files={"image": ("c1.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL06", "capture_mode": "recheck"},
    ).json()
    confirm_inspection(first["id"])

    # Shift only the baseline, so the cumulative value must exceed the gate while the
    # period-over-period change stays small.
    with SessionLocal() as session:
        record = session.get(Inspection, baseline["id"])
        record.planar_x_mm = record.planar_x_mm - 60.0
        session.commit()

    second = client.post(
        "/api/measure",
        files={"image": ("c2.png", crack_photo(boards, 5.0), "image/png")},
        data={"point": "MP-BL06", "capture_mode": "recheck"},
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["status"] == "pending"
    assert abs(body["opening_delta_mm"] - 3.0) <= 1.0
    assert body["opening_since_baseline_mm"] > 50.0


def test_single_period_gate_fires_on_the_first_recheck_too(
    client, make_point, crack_photo, confirm_inspection
):
    """The gate is not exempt just because previous and baseline are the same record."""
    boards = make_point("MP-BL07")
    baseline = client.post(
        "/api/points/MP-BL07/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    with SessionLocal() as session:
        record = session.get(Inspection, baseline["id"])
        record.planar_x_mm = record.planar_x_mm - 60.0
        session.commit()

    response = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL07", "capture_mode": "recheck"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "rejected"
    assert any("异常" in reason for reason in body["quality_reasons"])
```

- [ ] **Step 2: 运行测试确认失败**

Run: `.venv/bin/python -m pytest backend/tests/test_baseline_workflow.py -q`

Expected: FAIL。`/api/points/{id}/baseline` 返回 404，且 `/api/measure` 忽略 `point` 与
`capture_mode` 表单字段。

- [ ] **Step 3: 重写 `create_measurement` 的点位解析与比较逻辑**

In `backend/app/services/inspection.py`, add the helper and rewrite the middle of
`create_measurement`. Import `boards_for_point` and `scan_marker_ids`:

```python
from app.cv.pipeline import measure_image, scan_marker_ids
from app.services.registry import boards_for_point, match_point, point_to_dict


def last_confirmed_inspection(
    session: Session, monitor_point_id: str, before: datetime | None = None
) -> Inspection | None:
    query = select(Inspection).where(
        Inspection.monitor_point_id == monitor_point_id,
        Inspection.human_confirmed.is_(True),
    )
    if before is not None:
        query = query.where(Inspection.capture_time < before)
    return session.scalar(query.order_by(desc(Inspection.capture_time)))
```

Replace the decode-measure-match block. The point must be resolved *before* measuring,
because the board specs come from the point:

```python
    array = np.frombuffer(raw_image, np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取上传图片。")

    height, width = image.shape[:2]
    logger.info("image dimensions=%sx%s filename=%s", width, height, original_filename)

    camera_matrix, distortion, profile = _camera_for_image(image)
    detected_ids = scan_marker_ids(image, camera_matrix, distortion)
    point = match_point(session, detected_ids)

    if monitor_point_id is not None:
        requested = session.get(MonitorPoint, monitor_point_id)
        if requested is None:
            raise ValueError("监测点不存在。")
        if point is None:
            raise ValueError("未能从左右视觉标靶识别监测点，请重新拍摄并让两组复测贴完整入镜。")
        if point.monitor_point_id != monitor_point_id:
            raise ValueError(
                f"这张照片属于 {point.monitor_point_id}，不是 {monitor_point_id}。"
            )
    elif point is None and demo_case_valid:
        point = session.get(MonitorPoint, "MP-03")
    if point is None:
        raise ValueError("未能从左右视觉标靶自动匹配监测点。")

    if capture_mode == "recheck" and point.baseline_inspection_id is None:
        raise ValueError("该监测点尚未完成首次建档，请先采集并确认基线照片。")
    if capture_mode == "baseline" and point.baseline_inspection_id is not None:
        raise ValueError("该监测点已建档，无需重复采集基线。")

    left_board, right_board = boards_for_point(point)
    inspection_id = str(uuid.uuid4())
    evidence_dir = EVIDENCE_ROOT / inspection_id
    started = time.perf_counter()
    result = measure_image(
        image, camera_matrix, distortion, evidence_dir, left=left_board, right=right_board
    )
    processing_ms = (time.perf_counter() - started) * 1000
    logger.info("detected marker ids=%s", result.marker_ids)
    required_evidence = ["original.png", "undistorted.png", "overlay.png", "rectified.png"]
    if result.status == "accepted":
        required_evidence.extend(["rectified_left.png", "rectified_right.png"])
    missing = [
        name
        for name in required_evidence
        if not (evidence_dir / name).exists() or (evidence_dir / name).stat().st_size <= 0
    ]
    if missing:
        raise ValueError(f"证据图生成失败：{', '.join(missing)}")
```

Add `MonitorPoint` to the model import if not already present, and add the two new
parameters to the signature:

```python
def create_measurement(
    session: Session,
    raw_image: bytes,
    browser_lat: float | None,
    browser_lon: float | None,
    original_filename: str = "measurement.png",
    demo_case_id: str | None = None,
    monitor_point_id: str | None = None,
    capture_mode: str = "recheck",
) -> dict:
```

- [ ] **Step 4: 计算四个 delta，并把异常门收敛到单期**

Replace the delta block (currently around lines 163–195) with:

```python
    current_planar = result.planar_position_mm
    planar_x = float(current_planar[0]) if current_planar else None
    planar_y = float(current_planar[1]) if current_planar else None

    previous = last_confirmed_inspection(session, point.monitor_point_id)
    baseline = (
        session.get(Inspection, point.baseline_inspection_id)
        if point.baseline_inspection_id
        else None
    )

    if capture_mode == "baseline":
        opening_delta = shear_delta = 0.0
        opening_since_baseline = shear_since_baseline = 0.0
    else:
        opening_delta = (
            planar_x - previous.planar_x_mm
            if planar_x is not None and previous and previous.planar_x_mm is not None
            else None
        )
        shear_delta = (
            planar_y - previous.planar_y_mm
            if planar_y is not None and previous and previous.planar_y_mm is not None
            else None
        )
        opening_since_baseline = (
            planar_x - baseline.planar_x_mm
            if planar_x is not None and baseline and baseline.planar_x_mm is not None
            else None
        )
        shear_since_baseline = (
            planar_y - baseline.planar_y_mm
            if planar_y is not None and baseline and baseline.planar_y_mm is not None
            else None
        )

    previous_distance = (
        previous.current_distance_mm
        if previous and previous.current_distance_mm is not None
        else point.baseline_mm
    )
    current = result.distance_mm
    out_of_plane_delta = (
        result.dual_pnp_position_mm[2] if result.dual_pnp_position_mm is not None else None
    )

    reasons = list(result.quality.reasons)
    status = "pending" if result.status == "accepted" else "rejected"
    # The 50 mm gate catches an implausible single-period jump. The cumulative value is
    # deliberately uncapped: a long-tracked crack legitimately exceeds it.
    if opening_delta is not None and abs(opening_delta) > 50.0:
        reasons.append("测量结果与上次差异异常，请重新拍摄或使用卷尺复核。")
        status = "rejected"
        current = None
        opening_delta = shear_delta = None
        opening_since_baseline = shear_since_baseline = None
        out_of_plane_delta = None
```

Rename the removed `baseline_planar` / `baseline_pnp` locals; they are gone. The old
`_quality_payload(previous)` lookup is no longer needed because the values now live in
real columns.

- [ ] **Step 5: 写入新列并处理无坐标点位**

In the `Inspection(...)` construction, replace the location block and add the new fields:

```python
    if browser_lat is not None and browser_lon is not None and point.latitude is not None:
        location_match = _haversine_m(browser_lat, browser_lon, point.latitude, point.longitude) <= 100
        location_mode = "browser"
        latitude, longitude = browser_lat, browser_lon
    elif DEMO_LOCATION_MODE and point.latitude is not None:
        location_match = True
        location_mode = "demo"
        latitude, longitude = point.latitude, point.longitude
    else:
        location_match = None
        location_mode = "unavailable"
        latitude = longitude = None
```

and in the record:

```python
        capture_mode=capture_mode,
        planar_x_mm=planar_x,
        planar_y_mm=planar_y,
        opening_delta_mm=opening_delta,
        shear_delta_mm=shear_delta,
        opening_since_baseline_mm=opening_since_baseline,
        shear_since_baseline_mm=shear_since_baseline,
        camera_profile_is_demo=bool(profile.get("is_demo_profile", False)),
        crack_id=point.structure_name,
        baseline_crack_width_mm=8.0 if point.monitor_point_id == "MP-03" else None,
```

Extend `inspection_to_dict` so the frontend sees the new values:

```python
        "capture_mode": inspection.capture_mode,
        "opening_since_baseline_mm": inspection.opening_since_baseline_mm,
        "shear_since_baseline_mm": inspection.shear_since_baseline_mm,
        "camera_profile_is_demo": inspection.camera_profile_is_demo,
        "planar_position_mm": (
            [inspection.planar_x_mm, inspection.planar_y_mm]
            if inspection.planar_x_mm is not None
            else None
        ),
```

- [ ] **Step 6: 新增基线接口并在确认时固化基线**

In `backend/app/main.py`, add the baseline endpoint and extend `/api/measure`:

```python
@app.post("/api/points/{monitor_point_id}/baseline")
async def capture_baseline(
    monitor_point_id: str,
    image: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> dict:
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(415, "仅支持图片文件。")
    raw = await image.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 20 MB。")
    try:
        return create_measurement(
            session, raw, None, None,
            original_filename=image.filename or "baseline",
            monitor_point_id=monitor_point_id,
            capture_mode="baseline",
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
```

In the existing `measure` endpoint, add the two form fields and pass them through:

```python
async def measure(
    image: UploadFile = File(...),
    browser_lat: float | None = Form(default=None),
    browser_lon: float | None = Form(default=None),
    camera_profile: str | None = Form(default=None),
    demo_case_id: str | None = Form(default=None),
    point: str | None = Form(default=None),
    capture_mode: str = Form(default="recheck"),
    session: Session = Depends(get_db),
) -> dict:
    ...
        result = create_measurement(
            session, raw, browser_lat, browser_lon,
            original_filename=image.filename or "unnamed",
            demo_case_id=demo_case_id,
            monitor_point_id=point,
            capture_mode=capture_mode,
        )
```

In `confirm_inspection`, fix the baseline after the human confirms:

```python
    inspection.human_confirmed = True
    inspection.measurement_status = "confirmed"
    inspection.observer_name = payload.observer_name
    inspection.remark = payload.remark or inspection.remark
    inspection.visible_change_note = payload.visible_change_note
    point = session.get(MonitorPoint, inspection.monitor_point_id)
    if inspection.capture_mode == "baseline" and point.baseline_inspection_id is None:
        point.baseline_inspection_id = inspection.id
    session.commit()
    return inspection_to_dict(inspection, point)
```

- [ ] **Step 7: 修正把上次记录命名为基线的变量**

Confirm no `baseline_planar` / `baseline_pnp` identifiers remain in
`backend/app/services/inspection.py`. They held the *previous* record's values while being
named "baseline", which is the origin of the spec-level ambiguity this task removes.

Run: `grep -n "baseline_planar\|baseline_pnp" backend/app/services/inspection.py`

Expected: 无输出。

- [ ] **Step 8: 运行基线测试**

Run: `.venv/bin/python -m pytest backend/tests/test_baseline_workflow.py -q`

Expected: PASS，5 项全过。

- [ ] **Step 9: 运行全量回归**

Run: `.venv/bin/python -m pytest -q`

Expected: 全部通过。`test_api_workflow.py` 走的是无 `point` 参数的演示路径，
`match_point` 仍能识别 MP-03，因此不需要修改。

- [ ] **Step 10: 提交**

```bash
git add backend/app/services/inspection.py backend/app/main.py backend/tests/test_baseline_workflow.py
git commit -m "feat: add baseline state machine and cumulative-plus-period deltas"
```

---

### Task 4: 裂缝管理界面与跨平台开发环境

**Files:**
- Create: `frontend/src/pages/PointsPage.tsx`
- Create: `frontend/src/pages/PointFormPage.tsx`
- Create: `frontend/src/pages/PointDetailPage.tsx`
- Create: `frontend/e2e/helpers.ts`
- Create: `frontend/e2e/point-lifecycle.spec.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/pages/CapturePage.tsx`
- Modify: `frontend/src/pages/ResultPage.tsx`
- Modify: `frontend/src/pages/RecordPage.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/e2e/golden-path.spec.ts`
- Modify: `frontend/e2e/repeatability.spec.ts`
- Modify: `scripts/run_dev.py`
- Modify: `docs/MACOS.md`

**Interfaces:**
- Consumes: `POST /api/points`、`GET /api/points`、`GET /api/points/{id}`、
  `GET /api/points/{id}/history`、`GET /api/points/{id}/sticker.pdf`、
  `PUT /api/points/{id}/context-photo`、`POST /api/points/{id}/baseline`（T2、T3）
- Consumes: 测量响应字段 `opening_since_baseline_mm`、`opening_delta_mm`、`capture_mode`、
  `camera_profile_is_demo`、`baseline_crack_width_mm`（T3）
- Produces: `resolvePython(projectRoot: string, platform?: NodeJS.Platform): string`
- Produces routes: `/points`、`/points/new`、`/points/:monitorPointId`，
  以及 `/capture?point=<id>&mode=baseline|recheck`

- [ ] **Step 1: 写失败的跨平台路径解析测试**

Create `frontend/e2e/helpers.ts` 的测试先行版本 —— 在
`frontend/e2e/point-lifecycle.spec.ts` 顶部加入：

```ts
import path from "node:path";
import { expect, test } from "@playwright/test";
import { resolvePython } from "./helpers";

test("路径解析按平台返回正确的 Python", () => {
  delete process.env.GEORECHECK_PYTHON;
  expect(resolvePython("/repo", "win32")).toBe(path.join("/repo", ".venv", "Scripts", "python.exe"));
  expect(resolvePython("/repo", "darwin")).toBe(path.join("/repo", ".venv", "bin", "python"));
  expect(resolvePython("/repo", "linux")).toBe(path.join("/repo", ".venv", "bin", "python"));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run e2e --prefix frontend -- --grep "路径解析"`

Expected: FAIL，`Cannot find module './helpers'`。

- [ ] **Step 3: 实现 helper 并让两个既有 spec 使用它**

Create `frontend/e2e/helpers.ts`:

```ts
import path from "node:path";

export function resolvePython(
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (process.env.GEORECHECK_PYTHON) return process.env.GEORECHECK_PYTHON;
  const relative =
    platform === "win32" ? path.join(".venv", "Scripts", "python.exe") : path.join(".venv", "bin", "python");
  return path.join(projectRoot, relative);
}
```

In both `frontend/e2e/golden-path.spec.ts` and `frontend/e2e/repeatability.spec.ts`,
replace line 7:

```ts
const python = process.env.GEORECHECK_PYTHON ?? path.join(projectRoot, ".venv", "Scripts", "python.exe");
```

with:

```ts
import { resolvePython } from "./helpers";
const python = resolvePython(projectRoot);
```

In `scripts/run_dev.py` line 58, replace the hardcoded executable:

```python
        npm_command = "npm.cmd" if sys.platform == "win32" else "npm"
        frontend = subprocess.Popen([npm_command, "run", "dev"], cwd=ROOT / "frontend")
```

Add `import sys` if it is not already imported.

- [ ] **Step 4: 扩展前端类型与 API 客户端**

`frontend/src/types.ts` already declares `Point` (lines 1–16). **Extend it in place** —
do not add a second point type. `latitude` / `longitude` must widen to nullable because
T2 made the columns nullable:

```ts
export type Point = {
  hazard_id: string;
  hazard_name: string;
  monitor_point_id: string;
  monitor_point_name: string;
  structure_id: string;
  structure_name: string;
  location_description: string;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  baseline_mm: number;
  is_demo_location: boolean;
  left_marker_group: number[];
  right_marker_group: number[];
  baseline_inspection_id: string | null;
  baseline_status: "missing" | "confirmed";
  context_photo_path: string | null;
  context_photo_captured_at: string | null;
  last_capture_time?: string | null;
  last_distance_mm?: number | null;
  demo_ready?: boolean;
};

export type PointCreatePayload = {
  monitor_point_id: string;
  hazard_id: string;
  hazard_name: string;
  monitor_point_name: string;
  structure_id: string;
  structure_name: string;
  location_description: string;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
};
```

Extend the existing `Measurement` type with the fields T3 added:

```ts
  capture_mode: "baseline" | "recheck";
  opening_since_baseline_mm: number | null;
  shear_since_baseline_mm: number | null;
  camera_profile_is_demo: boolean;
  baseline_crack_width_mm: number | null;
```

`frontend/src/api/client.ts` has no `request` wrapper and no base-URL constant: every call is
`parseResponse<T>(await fetch("/api/..."))`, and `vite.config.ts` proxies `/api` and `/media`
to port 8000. Follow that shape exactly. The module already exports
`getPoints(): Promise<Point[]>` — reuse it for the list page rather than adding a second
function. Add:

```ts
export async function getPoint(id: string): Promise<Point> {
  return parseResponse<Point>(await fetch(`/api/points/${encodeURIComponent(id)}`));
}

export async function createPoint(payload: PointCreatePayload): Promise<Point> {
  return parseResponse<Point>(
    await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function getPointHistory(id: string): Promise<Measurement[]> {
  return parseResponse<Measurement[]>(
    await fetch(`/api/points/${encodeURIComponent(id)}/history`),
  );
}

export function stickerPdfUrl(id: string): string {
  return `/api/points/${encodeURIComponent(id)}/sticker.pdf`;
}

export async function uploadContextPhoto(id: string, file: Blob): Promise<Point> {
  const form = new FormData();
  form.append("image", file, "context.jpg");
  return parseResponse<Point>(
    await fetch(`/api/points/${encodeURIComponent(id)}/context-photo`, {
      method: "PUT",
      body: form,
    }),
  );
}

export async function captureBaseline(id: string, file: Blob): Promise<Measurement> {
  const form = new FormData();
  form.append("image", file, "baseline.png");
  return parseResponse<Measurement>(
    await fetch(`/api/points/${encodeURIComponent(id)}/baseline`, {
      method: "POST",
      body: form,
    }),
  );
}
```

`measureImage` currently takes `(file, location?, demoCaseId?)` with `demoCaseId` positional,
and `CapturePage` already calls it that way. **Add a fourth parameter** rather than changing
the third, so the existing call site keeps working:

```ts
export async function measureImage(
  file: Blob,
  location?: { latitude: number; longitude: number },
  demoCaseId?: string,
  pointContext?: { point: string; captureMode: "baseline" | "recheck" },
): Promise<Measurement> {
  const form = new FormData();
  const filename = file instanceof File ? file.name : "measurement.png";
  form.append("image", file, filename);
  if (location) {
    form.append("browser_lat", String(location.latitude));
    form.append("browser_lon", String(location.longitude));
  }
  form.append("camera_profile", "demo_webcam_profile");
  if (demoCaseId) form.append("demo_case_id", demoCaseId);
  if (pointContext) {
    form.append("point", pointContext.point);
    form.append("capture_mode", pointContext.captureMode);
  }
  return parseResponse<Measurement>(
    await fetch("/api/measure", { method: "POST", body: form }),
  );
}
```

- [ ] **Step 5: 写管理界面的失败 E2E**

Append to `frontend/e2e/point-lifecycle.spec.ts`:

```ts
test("可创建点位、下载复测贴并进入基线采集", async ({ page }) => {
  const pointId = `MP-E2E-${Date.now()}`;
  await page.goto("/points/new");
  await page.getByLabel("监测点编号").fill(pointId);
  await page.getByLabel("隐患点编号").fill("HZ-E2E-001");
  await page.getByLabel("隐患点名称").fill("E2E 隐患点");
  await page.getByLabel("监测点名称").fill("E2E 墙缝");
  await page.getByLabel("构筑物编号").fill("WALL-E2E");
  await page.getByLabel("构筑物名称").fill("E2E 墙体");
  await page.getByLabel("位置描述").fill("E2E 位置描述");
  await page.getByRole("button", { name: "创建监测点" }).click();

  await expect(page).toHaveURL(new RegExp(`/points/${pointId}$`));
  await expect(page.getByTestId("baseline-status")).toHaveText("未建档");
  await expect(page.getByTestId("marker-ids")).toContainText("左");
  await expect(page.getByRole("link", { name: "下载复测贴 PDF" })).toBeVisible();

  await page.getByRole("link", { name: "采集基线" }).click();
  await expect(page).toHaveURL(new RegExp(`point=${pointId}&mode=baseline`));
});

test("管理列表显示新建的点位与建档状态", async ({ page }) => {
  await page.goto("/points");
  await expect(page.getByRole("heading", { name: "裂缝管理" })).toBeVisible();
  await expect(page.getByTestId("point-row").first()).toBeVisible();
});
```

- [ ] **Step 6: 运行 E2E 确认失败**

Run: `npm run e2e --prefix frontend -- --grep "可创建点位"`

Expected: FAIL，`/points/new` 命中 `<Route path="*">` 被重定向到 `/`。

- [ ] **Step 7: 实现三个管理页面**

Create `frontend/src/pages/PointsPage.tsx` — 列表页，每行显示监测点编号、名称、构筑物、
建档状态与最近一次确认的累计变化，行内链接到详情；顶部有「新建监测点」按钮。
每行根元素加 `data-testid="point-row"`。

Create `frontend/src/pages/PointFormPage.tsx` — 表单页，七个必填文本字段，
`<label>` 文案必须与 E2E 中的 `getByLabel` 一致：监测点编号、隐患点编号、隐患点名称、
监测点名称、构筑物编号、构筑物名称、位置描述；可选的现场全景文件输入；
提交按钮文案「创建监测点」。提交成功后 `navigate(\`/points/${id}\`)`；
失败时把接口返回的 `detail` 显示在表单顶部的 `role="alert"` 区域。
标靶 ID 不出现在表单里 —— 由后端分配。

Create `frontend/src/pages/PointDetailPage.tsx` — 详情页，包含：
- 标靶 ID 展示区，`data-testid="marker-ids"`，格式「左 309, 310, 311, 312 / 右 313, 314, 315, 316」
- 建档状态徽标，`data-testid="baseline-status"`，文案为「未建档」或「已建档」
- 「下载复测贴 PDF」链接，`href={stickerPdfUrl(id)}`
- 现场全景缩略图与「更新现场全景」上传入口
- 未建档时显示「采集基线」链接指向 `/capture?point=<id>&mode=baseline`；
  已建档时显示「开始复测」链接指向 `/capture?point=<id>&mode=recheck`
- 按 `capture_time` 倒序的已确认记录列表，每条显示时间、累计变化、单期变化

Register the routes in `frontend/src/App.tsx`:

```tsx
        <Route path="/points" element={<PointsPage />} />
        <Route path="/points/new" element={<PointFormPage />} />
        <Route path="/points/:monitorPointId" element={<PointDetailPage />} />
```

Add the nav entry in `frontend/src/components/AppShell.tsx` next to the existing links:

```tsx
          <NavLink to="/points">裂缝管理</NavLink>
```

Add the styles these pages need to `frontend/src/styles.css`, following the existing class
naming (`page`, `page-heading`, `button`, `notice`).

- [ ] **Step 8: 把 Capture / Result / Record 绑定到点位上下文**

In `frontend/src/pages/CapturePage.tsx`, read the new query parameters and forward them:

```ts
  const pointId = searchParams.get("point") ?? undefined;
  const captureMode = (searchParams.get("mode") as "baseline" | "recheck" | null) ?? undefined;
```

In `submitBlob`, replace the measure call. Baseline capture uses its own endpoint:

```ts
      const result = pointId && captureMode === "baseline"
        ? await captureBaseline(pointId, blob)
        : await measureImage(
            blob,
            location,
            pointId ? undefined : selectedCase?.case_id,
            pointId ? { point: pointId, captureMode: captureMode ?? "recheck" } : undefined,
          );
```

When `pointId` is present, the page heading must show the point instead of the hardcoded
"贵州仁怀 · 公开工作场景复原" / "裂缝编号 CRACK-W01"; when it is absent the V0.4 demo copy
stays exactly as it is. Hide the demo-case picker whenever `pointId` is set.

In `frontend/src/pages/ResultPage.tsx`:
- Main figure becomes `opening_since_baseline_mm` labelled「较基线累计」;
  secondary line becomes `opening_delta_mm` labelled「较上次」。
- When `capture_mode === "baseline"`, show「基线已建立」instead of two numbers.
- Hide the「首次人工建档开度 / 换算复测开度」block entirely when
  `baseline_crack_width_mm === null`.
- When `camera_profile_is_demo` is true, render a persistent
  `role="alert"` banner：「未标定相机，毫米值仅供参考。」

In `frontend/src/pages/RecordPage.tsx`, replace the fixed「贵州仁怀」heading with
`record.monitor_point_name`、`record.structure_name`、`record.scene_type`，
并同样显示两个数字与未标定标注。

- [ ] **Step 9: 运行前端构建与全部 E2E**

Run: `npm run build --prefix frontend && npm exec --prefix frontend playwright install chromium && npm run e2e --prefix frontend`

Expected: 类型检查与构建通过；原有 golden-path 与 repeatability 用例，
加上新增的路径解析、点位创建、管理列表用例全部通过。

- [ ] **Step 10: 更新 macOS 文档**

In `docs/MACOS.md`, replace the section stating that `npm run e2e` is unavailable on macOS.
It now works; document the one-time `npm exec --prefix frontend playwright install chromium`
step and the `GEORECHECK_PYTHON` override.

- [ ] **Step 11: 提交**

```bash
git add frontend/src frontend/e2e scripts/run_dev.py docs/MACOS.md
git commit -m "feat: add crack point management UI and cross-platform e2e"
```

---

### Task 5: AI 现场复核泛化到真实点位

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/services/ai_review.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/pages/ResultPage.tsx`
- Modify: `frontend/src/pages/PointDetailPage.tsx`
- Create: `backend/tests/test_ai_review_real_point.py`
- Modify: `docs/VALIDATION.md`

**Interfaces:**
- Consumes: `MonitorPoint.context_photo_path`、`context_photo_captured_at`（T2）
- Consumes: `Inspection.capture_mode`、`context_photo_used`（T2、T3）
- Consumes: `last_confirmed_inspection(session, point_id, before)`（T3）
- Produces: `ReviewImages(context: Path, previous: Path, current: Path)`
- Produces: `resolve_review_images(session, inspection, case_id: str | None) -> ReviewImages`
- Produces: `CONTEXT_PHOTO_STALE_DAYS: int`（默认 90，可由环境变量覆盖）
- Produces: 点位响应字段 `context_photo_is_stale: bool`

- [ ] **Step 1: 写失败测试 —— 真实点位取图与基线禁用**

Create `backend/tests/test_ai_review_real_point.py`:

Uses the same `conftest.py` fixtures as T3. A real JPEG is needed for the context upload,
so the fixture-free bytes literal is replaced by an encoded image.

```python
import cv2
import numpy as np

from app.config import EVIDENCE_ROOT
from app.db.session import SessionLocal
from app.models import Inspection
from app.services.ai_review import resolve_review_images


def context_jpeg() -> bytes:
    encoded, buffer = cv2.imencode(".jpg", np.full((120, 160, 3), 180, np.uint8))
    assert encoded
    return buffer.tobytes()


def test_real_point_review_images_come_from_point_and_history(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-AI01")
    uploaded = client.put(
        "/api/points/MP-AI01/context-photo",
        files={"image": ("ctx.jpg", context_jpeg(), "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text
    baseline = client.post(
        "/api/points/MP-AI01/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    current = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 3.0), "image/png")},
        data={"point": "MP-AI01", "capture_mode": "recheck"},
    ).json()

    with SessionLocal() as session:
        inspection = session.get(Inspection, current["id"])
        images = resolve_review_images(session, inspection, None)
        assert images.current == EVIDENCE_ROOT / current["id"] / "original.png"
        assert images.previous == EVIDENCE_ROOT / baseline["id"] / "original.png"
        assert images.context.name == "context.jpg"
        assert "MP-AI01" in str(images.context)


def test_baseline_capture_has_no_ai_review(client, make_point, crack_photo):
    boards = make_point("MP-AI02")
    baseline = client.post(
        "/api/points/MP-AI02/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    response = client.post(f"/api/inspections/{baseline['id']}/ai-review", json={})
    assert response.status_code == 422
    assert "基线" in response.json()["detail"]


def test_real_point_without_context_photo_is_refused(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-AI03")
    baseline = client.post(
        "/api/points/MP-AI03/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    current = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-AI03", "capture_mode": "recheck"},
    ).json()
    response = client.post(f"/api/inspections/{current['id']}/ai-review", json={})
    assert response.status_code == 422
    assert "现场全景" in response.json()["detail"]


def test_demo_case_review_images_are_unchanged():
    """The demo-case branch must keep reading the three fixed files."""
    with SessionLocal() as session:
        inspection = Inspection(
            id="ai-demo-case-fixture",
            monitor_point_id="MP-03",
            capture_mode="recheck",
        )
        images = resolve_review_images(session, inspection, "case_02_widening")
        assert images.context.name == "context.jpg"
        assert images.previous.name == "previous_close.jpg"
        assert images.current.name == "current_close.jpg"
        assert "case_02_widening" in str(images.context)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `.venv/bin/python -m pytest backend/tests/test_ai_review_real_point.py -q`

Expected: FAIL，`resolve_review_images` 无法从 `app.services.ai_review` 导入。

- [ ] **Step 3: 新增过期阈值配置**

In `backend/app/config.py`, next to the other environment-driven settings:

```python
CONTEXT_PHOTO_STALE_DAYS = int(os.getenv("CONTEXT_PHOTO_STALE_DAYS", "90"))
```

Add the same key to `.env.example` with a comment stating it is a reminder threshold only
and never blocks an operation.

- [ ] **Step 4: 实现通用取图器**

In `backend/app/services/ai_review.py`, replace `_case_paths` with:

```python
from dataclasses import dataclass

from app.models import AIReview, AIReviewItem, Inspection, MonitorPoint
from app.services.inspection import last_confirmed_inspection


@dataclass(frozen=True)
class ReviewImages:
    context: Path      # 图1 site overview: a constant reference, not a change input
    previous: Path     # 图2 last confirmed close-up
    current: Path      # 图3 this capture


def _case_paths(case_id: str) -> ReviewImages:
    if not case_id.startswith("case_") or any(token in case_id for token in ("/", "\\", "..")):
        raise ValueError("Demo Case 编号无效。")
    case_root = (config.DEMO_CASES_ROOT / case_id).resolve()
    if case_root.parent != config.DEMO_CASES_ROOT.resolve() or not case_root.is_dir():
        raise ValueError("Demo Case 不存在。")
    return ReviewImages(
        case_root / "context.jpg",
        case_root / "previous_close.jpg",
        case_root / "current_close.jpg",
    )


def resolve_review_images(
    session: Session, inspection: Inspection, case_id: str | None
) -> ReviewImages:
    if case_id:
        return _case_paths(case_id)
    if inspection.capture_mode == "baseline":
        raise ValueError("首次建档没有可比较的上次近景，基线采集不提供 AI 现场复核。")
    point = session.get(MonitorPoint, inspection.monitor_point_id)
    if point is None or not point.context_photo_path:
        raise ValueError("该监测点尚未上传现场全景，无法进行 AI 现场复核。")
    previous = last_confirmed_inspection(
        session, inspection.monitor_point_id, before=inspection.capture_time
    )
    if previous is None:
        raise ValueError("该监测点没有上一次已确认记录，无法比较。")
    context = config.EVIDENCE_ROOT / "points" / point.monitor_point_id / "context.jpg"
    if not context.exists():
        raise ValueError("该监测点的现场全景文件缺失，请重新上传。")
    return ReviewImages(
        context,
        config.EVIDENCE_ROOT / previous.id / "original.png",
        config.EVIDENCE_ROOT / inspection.id / "original.png",
    )
```

Rewrite `run_and_persist_ai_review` to take an optional case id and record the context
version used. Note the metadata dict deliberately keeps a single number: prompt rule 22
already fights numeric anchoring, so the cumulative value is not passed to the model.

```python
def run_and_persist_ai_review(
    session: Session,
    inspection: Inspection,
    case_id: str | None = None,
) -> dict[str, Any]:
    images = resolve_review_images(session, inspection, case_id)
    review = AIReview(
        id=str(uuid.uuid4()),
        inspection_id=inspection.id,
        provider="stepfun",
        model=config.STEPFUN_MODEL,
        status="running",
        attempts=0,
    )
    if case_id:
        inspection.demo_case_id = case_id
    inspection.context_photo_used = str(images.context)
    session.add(review)
    session.commit()
    try:
        parsed, latency_ms, attempts = run_field_review(
            images.context,
            images.previous,
            images.current,
            {
                "crack_id": inspection.crack_id or "CRACK-W01",
                "opening_delta_mm": (
                    inspection.opening_delta_mm
                    if inspection.measurement_status != "rejected"
                    else None
                ),
                "measurement_status": inspection.measurement_status,
            },
        )
    except StepFunReviewError as error:
        review.status = "failed"
        review.error_code = error.code
        review.error_message = str(error)
        session.commit()
        return ai_review_to_dict(session, review)
    ...
```

Update `build_confirmed_record_text` to narrate both numbers:

```python
def build_confirmed_record_text(session: Session, inspection: Inspection) -> str:
    if inspection.opening_delta_mm is None:
        parts = ["本次几何测量未通过质量门控，未形成毫米结果。"]
    else:
        parts = [f"本次裂缝较上期张开 {inspection.opening_delta_mm:.1f} mm"]
        if inspection.opening_since_baseline_mm is not None:
            parts.append(f"，自首次建档累计张开 {inspection.opening_since_baseline_mm:.1f} mm")
        parts.append("。")
```

Keep the rest of the function unchanged.

- [ ] **Step 5: 让接口接受两种来源并暴露过期标记**

`backend/app/main.py:109` already declares `AIReviewPayload` with a **required** `case_id`,
and the endpoint body already passes `payload.case_id` and maps `ValueError` to 422. The only
change needed is making the field optional so a real point can post `{}`:

```python
class AIReviewPayload(BaseModel):
    case_id: str | None = Field(default=None, pattern=r"^case_[a-z0-9_]+$", max_length=64)
```

Leave the `run_ai_review` endpoint body unchanged — it already does the right thing once the
resolver accepts `None`.

In `registry.point_to_dict`, add the staleness flag:

```python
from datetime import datetime, timedelta

from app.config import CONTEXT_PHOTO_STALE_DAYS
...
        "context_photo_is_stale": (
            point.context_photo_captured_at is not None
            and point.context_photo_captured_at
            < datetime.now() - timedelta(days=CONTEXT_PHOTO_STALE_DAYS)
        ),
```

- [ ] **Step 6: 前端显示全景过期提示**

In `frontend/src/pages/PointDetailPage.tsx` and `frontend/src/pages/ResultPage.tsx`, when the
point payload has `context_photo_is_stale === true`, render a non-blocking notice:

```tsx
{point.context_photo_is_stale ? (
  <p className="notice" role="status">
    现场全景已是 {point.context_photo_captured_at?.slice(0, 10)} 拍摄，建议更新后再做 AI 复核。
  </p>
) : null}
```

Add `context_photo_is_stale: boolean;` to the `Point` type in `frontend/src/types.ts`.
The notice must never disable any button.

- [ ] **Step 7: 运行 AI 复核测试**

Run: `.venv/bin/python -m pytest backend/tests/test_ai_review_real_point.py -q`

Expected: PASS，4 项全过。这些测试不调用外部服务：前三项在 `run_field_review` 之前
就抛错或只检查取图结果，第四项只解析路径。

- [ ] **Step 8: 运行全量回归与构建**

Run: `.venv/bin/python -m pytest -q && npm run build --prefix frontend && npm run e2e --prefix frontend`

Expected: 全部通过。`test_ai_review.py`（V0.4 的既有测试）不修改即通过，
因为 demo case 分支行为未变。

- [ ] **Step 9: 更新验证文档的表述边界**

In `docs/VALIDATION.md`, add a section stating:

- 本次迭代交付链路可用性，不是现场精度；
- MAE 0.496 mm 与 P95 1.002 mm 仅在受控合成场景成立，不可外推为实拍精度；
- 打印缩放误差按比例转化为测量误差，缩放至 98% 会使毫米值系统性偏差 2%，
  复测贴 PDF 上的 100 mm 校核边必须实际测量；
- 复测贴须贴附硬质衬底，左右两块须共面，否则平面假设不成立；
- 多场景受控精度基准推迟至 V0.6。

- [ ] **Step 10: 提交**

```bash
git add backend/app/services/ai_review.py backend/app/config.py backend/app/main.py backend/app/services/registry.py frontend/src docs/VALIDATION.md backend/tests/test_ai_review_real_point.py .env.example
git commit -m "feat: extend AI field review to user-created points"
```

---

## Self-review

**Spec 覆盖检查**

| Spec 要求 | 实现任务 |
|---|---|
| F1 测量层按点位参数化 | T1 Step 3–5 |
| F2 标靶唯一性由主键保证 | T2 Step 3–5 |
| F3 自动分配连续空闲块 | T2 Step 5 `allocate_marker_block` |
| F4 可打印复测贴 PDF | T2 Step 6–7 |
| F5 未标定全链路标注并持久化 | T3 Step 5（`camera_profile_is_demo`）、T4 Step 8 |
| F6 基线建档与未建档拒绝 | T3 Step 3、Step 6 |
| F7 双数字 | T3 Step 4 |
| F8 点位不一致时拒绝且不回退 | T3 Step 3 |
| F9 三个管理界面 | T4 Step 7 |
| F10 跨平台启动与 E2E | T4 Step 3 |
| F11 全景归属点位、可更新、留痕、过期提示 | T2 Step 3、Step 7；T5 Step 3–6 |
| F12 AI 复核用于真实点位 | T5 Step 4–5 |
| 验收条件 1–11 | 分别由 T4/T2/T1/T3/T3/T3/T4/T5/T4/T5/各任务末尾回归覆盖 |

**类型一致性检查**

- `boards_for_point(point)` 在 T2 定义为单参数（依赖 `lazy="selectin"` 关系），
  T3 Step 3 与测试中的调用一致。
- `point_to_dict(point)` 全程保持单参数，因此 `inspection_to_dict(inspection, point)` 无需改签名。
- `match_point(session, detected_ids)` 签名不变，T3 直接复用。
- `last_confirmed_inspection` 在 T3 定义，T5 以关键字 `before=` 调用，与定义一致。
- `resolve_review_images(session, inspection, case_id)` 三参数，T5 测试与 `run_and_persist_ai_review` 调用一致。
- `capture_mode` 取值 `"baseline"` / `"recheck"` 在模型、API、路由与前端类型中统一。
- `ReviewImages` 字段顺序 `context, previous, current` 与 `run_field_review` 的位置参数顺序一致。

**已知的执行期注意事项**

- T2 Step 5 的表重建依赖 `Base.metadata.tables["monitor_points"]` 反映的是新模型定义，
  因此 Step 4 必须先于 Step 5 完成。
- `backend/tests/conftest.py`（T2 Step 1）是 T2、T3、T5 三个任务共用的脚手架。
  `backend/tests/__init__.py` 不存在且不应新增：测试模块之间不互相 import，共享 helper
  一律走 fixture。`crack_photo` fixture 依赖 T1 的 `render_case(..., boards=)`。
- 整个后端测试套共用同一个 SQLite 文件，`clean_test_points` autouse fixture 负责在每个测试
  之后清掉 `MP-T*` / `MP-BL*` / `MP-AI*` 点位。新增测试若创建点位，编号必须落在这三个前缀内。
- 前端所有请求走 vite 代理的相对路径，`frontend/src/api/client.ts` 只有
  `parseResponse<T>(response)` 一个包装器，没有 base-URL 常量。T4 Step 4 的代码已按此写就，
  不要引入新的 fetch 包装器。
- `Point` 与 `Measurement` 是 `types.ts` 中的既有类型，T4 Step 4 是就地扩展而非新建。
- `AIReviewPayload` 是 `main.py:109` 的既有模型，T5 Step 5 只把 `case_id` 改为可选。
