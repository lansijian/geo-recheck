# V0.5 交接文档：固定裂缝复测 MVP

> 面向接手这条分支继续开发的工程 agent 或工程师。
>
> 分支 `feat/fixed-crack-recheck-mvp`，15 个 commit，从 `main` 的 `d6e6b5c`（V0.4）分出，
> **尚未合并**。撰写时 head 为 `42a3710`。

---

## 目录

1. [这个分支解决了什么](#1-这个分支解决了什么)
2. [15 个 commit 讲解](#2-15-个-commit-讲解)
3. [架构与数据模型](#3-架构与数据模型)
4. [关键设计决策及理由](#4-关键设计决策及理由)
5. [不可动摇的安全属性](#5-不可动摇的安全属性)
6. [如何测试](#6-如何测试)
7. [如何接续开发](#7-如何接续开发)
8. [陷阱清单](#8-陷阱清单)

---

## 1. 这个分支解决了什么

### 背景

GeoRecheck 的测量原理：在墙缝两侧各贴一块印有 4 个 AprilTag 的「复测贴」（100×60 mm 硬质板），
拍照后用确定性几何算法解算两块板的相对位移，得到裂缝的张开量。

V0.4 之前，系统里**只有一个写死的演示点位 MP-03**，标靶 ID 固定为 301–308。
`measure_image()` 在 `pipeline.py` 里直接引用 `DEMO_LEFT` / `DEMO_RIGHT` 常量，
所以即使建了新点位，拍照也永远解算不出位姿 —— 质量门控直接拒绝，出不了数。

### 本分支交付

把它变成"任何人能给任意一条真实墙缝建立复测点并长期跟踪"的单机 MVP：

| 能力 | 说明 |
|---|---|
| 测量层按点位参数化 | `measure_image()` 接受标靶规格，不再写死 |
| 标靶身份 | 每个点位独占 8 个 AprilTag ID，唯一性由数据库主键保证 |
| 自动分配 | 建点时系统取最低的一段连续空闲 ID，用户看不到也不需要填数字 |
| 可打印复测贴 | 按点位生成两页 A4 PDF，页眉印点位编号与实际 ID |
| 基线状态机 | 首次建档 → 已建档；未建档拒绝普通复测 |
| 双数字 | 「较基线累计」为主、「较上次」为副 |
| 管理界面 | 列表 / 新建 / 详情三页 |
| AI 复核泛化 | 真实点位用自己的现场全景 + 历史证据，不再只能读 demo_cases |
| 跨平台 | macOS 与 Windows 同一套启动脚本与 E2E |

**明确不做**（这是设计文档写死的非范围，不要擅自扩张）：风险等级、预警、撤离建议、
绝对裂缝宽度结论、账户与多人协同、云同步、地图平台、原生移动应用、
把裂缝分割推理接入主链路、多场景受控精度基准（推迟到 V0.6）。

权威设计文档：`docs/superpowers/specs/2026-08-28-fixed-crack-recheck-mvp-design.md`
实施计划：`docs/superpowers/plans/2026-08-28-fixed-crack-recheck-mvp.md`

---

## 2. 15 个 commit 讲解

开发按五个任务推进，每个任务都经过独立评审 + 修复轮，最后加一次全分支终审。
`feat:` 是任务主体，`fix:` 是评审发现后的修复，读的时候应该把它们成对理解。

### 任务 1 — 测量层参数化

**`247849e feat: measure arbitrary board pairs instead of hardcoded demo tags`**

整个 MVP 的地基。`pipeline.py` 的 `measure_image()` 在 4 处写死了 `DEMO_LEFT`/`DEMO_RIGHT`。

好消息是 `estimate_board_pose()`、`rectify_board()`、`measure_planar_relative()`
**本来就接受 `BoardSpec` 参数**，只是默认值指向演示板。所以改动只有约 30 行：

- `measure_image(image, K, d, output_dir=None, left=DEMO_LEFT, right=DEMO_RIGHT)` —— 带默认值，
  8 个既有调用点一行不改；
- 新增 `scan_marker_ids(image, K, d) -> list[int]`，纯检测，用于在测量前确定点位身份；
- `synthetic.py` 的 `render_case()` / `build_canonical_wall_plane()` 接受 `boards` 参数，
  让测试能构造非演示标靶的场景；
- 删除 `board_geometry.py` 的 `board_for_marker()`（全仓无调用者，且把"只有两块演示板"
  的假设埋在几何层）。

> 这个问题之所以致命，是因为没人注意到它 —— 而不是因为它难。最初的实施计划里
> 五个任务没有一个提到 `pipeline.py`，照那份计划实现完，"创建新点位并复测出数"
> 这条验收条件是跑不通的。

### 任务 2 — 标靶身份、自动分配、可打印贴纸

**`1b777f7 feat: allocate unique marker blocks per point and emit printable stickers`**
**`e10abef fix: preserve marker_assignments FK across the monitor_points rebuild`**

核心是把「一个标靶 ID 只属于一个点位」**从约定变成主键约束**。两个点位共用一个 tag，
后果是测量结果记到错的裂缝上 —— 这是安全属性，不该靠函数校验来防。

新增表：

```python
class MarkerAssignment(Base):
    __tablename__ = "marker_assignments"
    marker_id: Mapped[int] = mapped_column(Integer, primary_key=True)   # 唯一性 = 主键
    monitor_point_id: Mapped[str] = mapped_column(ForeignKey("monitor_points.monitor_point_id"), index=True)
    side: Mapped[str] = mapped_column(String(8))      # left | right
    slot: Mapped[int] = mapped_column(Integer)        # 0..3
```

`slot` 不可省略：`BoardSpec.marker_corners_mm()` 用 `marker_ids.index(marker_id)` 推算
该标靶在板上的行列位置，**元组顺序直接决定物理坐标**。逗号分隔字符串是偶然保住顺序，
`slot` 是明确保住。

分配算法（`services/registry.py`）：AprilTag 36h11 共 587 个 ID（0–586），每点位 8 个，
理论上限 73 个点位。取**最低的一段连续空闲块** —— 连续便于打印页人工核对，
取最低可回收删除点位留下的空洞。

`fix` 那个 commit 修的是迁移里一个真实的 SQLite 陷阱：
`ALTER TABLE monitor_points RENAME TO ...` 会重写 `marker_assignments` 里的
`REFERENCES` 子句，删掉旧表后外键就悬空了（实测 `PRAGMA foreign_key_check` 报 8 处违规）。
解法是把 RENAME 包在 `PRAGMA legacy_alter_table=ON/OFF` 里。同一个函数里还处理了另一个陷阱：
SQLite 不会把索引跟着表一起改名，旧索引会与新表的同名索引冲突。

### 任务 3 — 基线状态机与双数字

**`c1afdc2 feat: add baseline state machine and cumulative-plus-period deltas`**
**`ea71f63 fix: restore the plain 50mm gate and fix the test that mis-described it`**
**`0e9a7ab fix: validate capture_mode and pin the no-fallback guarantee with a real test`**

点位状态由数据推导，不额外存字段：`baseline_inspection_id` 为空即未建档。

四个毫米量：

```
opening_delta_mm          = 本次 planar_x - 上次已确认 planar_x     # 较上次
shear_delta_mm            = 本次 planar_y - 上次已确认 planar_y
opening_since_baseline_mm = 本次 planar_x - 基线 planar_x           # 较基线累计（主数字）
shear_since_baseline_mm   = 本次 planar_y - 基线 planar_y
```

顺带把 `planar_position_mm` 从 `quality_reasons` 的 JSON blob 里提升为
`planar_x_mm` / `planar_y_mm` 真列 —— 基线是被长期引用的数据，以字符串键取值太脆。

同时把一个装着"上次"值却叫 `baseline_planar` 的变量改名为 `previous_planar`。
设计文档里"基线"与"上一次记录"的歧义，很可能就是从这个名字来的。

### 任务 4 — 管理界面与跨平台

**`4678f3c feat: add crack point management UI and cross-platform e2e`**
**`ff7fa85 fix: stop rendering absolute distances and zero-baseline deltas as measurements`**

三个新页面（`PointsPage` / `PointFormPage` / `PointDetailPage`），既有的
Capture / Result / Record 绑定到点位上下文。跨平台方面修了三处 Windows 写死：
两个 E2E spec 的 `.venv/Scripts/python.exe`、`run_dev.py` 的 `npm.cmd`、
`playwright.config.ts` 的 `webServer.command`。

`fix` 修的两个问题都值得记住：

- **列表页把 `last_distance_mm` 当结果显示**。那是板间绝对距离（约 300 mm），
  且取自最新一条检查记录（不论是否确认）。在裂缝列表上放一个 300 mm 的数字，
  监测员会读成裂缝宽度 —— 违反"绝不呈现绝对宽度"。改为后端只返回最近**已确认**记录的
  `last_confirmed_opening_since_baseline_mm`，旧的两个字段整个删掉。
- **记录页把基线打印成两个零测量值**。建立基线必须经过确认，所以每个新点位的第一张
  打印记录都会写着「较基线累计 +0.0 mm · 较上次 +0.0 mm」，和它上方的"基线已建立"卡片自相矛盾。

### 任务 5 — AI 复核泛化

**`0494885 feat: extend AI field review to user-created points`**
**`423b51a fix: let a real point's recheck reach AI field review from the browser`**

V0.4 的 AI 复核只能读 `data/demo_cases/{case_id}/` 下三张固定图。改为通用取图器：

```python
@dataclass(frozen=True)
class ReviewImages:
    context: Path      # 图1 现场全景：固定参照，不是变化检测输入
    previous: Path     # 图2 上次已确认近景
    current: Path      # 图3 本次近景
```

Demo Case 分支行为完全不变；真实点位分支从点位的现场全景 + 上一次已确认记录的
`original.png` 取图。

`fix` 那个 commit 补的是：后端支持了，但 `ResultPage` 的触发按钮仍然只在有
`demo_case_id` 时才出现，导致这个能力从浏览器根本够不着。

### 终审与收尾

**`7026a38 fix: close four pre-merge safety gaps ...`**

全分支终审发现的四项，其中一项是真实的误归属路径：真实点位质量门控失败后点「重新拍摄」，
会被一行 V0.4 遗留的硬编码路由 `navigate("/capture?demo=1&case=case_05_quality_fail")`
带进演示流程，最终把记录写到 MP-03 名下。**五个任务的分任务评审都看不到它，
只有全分支视角能抓到。**

另外三项：两个管理界面缺少未标定相机标注、贴纸 PDF 用 Helvetica 渲染中文构筑物名变成黑方块、
基线记录文本没有 baseline 分支。

**`42a3710 fix: restore drag-and-drop and click-to-upload on the capture panel`**

V0.4 重写 CapturePage 时删掉了拖拽处理器，却留下了"我是拖拽区"的文案和
`.camera-panel.dragging` 死样式。面板看着是上传区，实际既不接拖拽也不接点击。已恢复。

### 文档 commit

`fdd77b9`（重写设计与计划）、`182dd7f` / `bc2c72c`（把实现中发现的缺陷回写进计划）、
`d471da0`（前一版交接文档）。

---

## 3. 架构与数据模型

技术栈不变：React 19 + TypeScript + Vite 7 / FastAPI + SQLAlchemy 2 + SQLite /
OpenCV `DICT_APRILTAG_36h11` / reportlab / pytest + Playwright。**本分支未引入任何新依赖。**

### 一次复测的数据流

```
上传照片
  ↓
scan_marker_ids(image, K, d)          纯检测，得到画面里所有 tag id
  ↓
match_point(session, ids)             一次 IN 查询；要求左右各 ≥3 个 tag
  ↓
[若请求带显式 point 参数] 校验一致性，不一致 → 422，永不回退
  ↓
boards_for_point(point)               按 slot 顺序组装两个 BoardSpec
  ↓
measure_image(image, K, d, out, left, right)
  ↓
四个 delta + 质量门控 + 证据图
  ↓
pending 记录 → 人工确认 → confirmed（若为 baseline 则固化 baseline_inspection_id）
```

> 检测跑两遍（`scan_marker_ids` 一次、`measure_image` 内部一次），每次上传约多 50–100 ms。
> 这是有意的取舍：让 `pipeline.py` 保持纯视觉计算、不认识数据库。见遗留项 6。

### 数据模型变更

**新增表** `marker_assignments`（见任务 2）。

**`MonitorPoint` 新增/变更**

| 字段 | 说明 |
|---|---|
| `baseline_inspection_id` | 可空，指向已确认的基线记录；为空即未建档 |
| `context_photo_path` | 可空，现场全景 |
| `context_photo_captured_at` | 可空，全景拍摄时间 |
| `context_callouts` | 可空，JSON，演示点位用 |
| `latitude` / `longitude` | 由非空改为**可空**（需要 SQLite 表重建） |
| `baseline_mm` | **遗留字段**，新点位写 0.0，界面不再展示 |
| `left_marker_group` / `right_marker_group` | **遗留字段，只写不读**；事实来源是 `marker_assignments` |

**`Inspection` 新增**

`capture_mode`（`baseline`/`recheck`）、`planar_x_mm`、`planar_y_mm`、
`opening_since_baseline_mm`、`shear_since_baseline_mm`、`camera_profile_is_demo`、
`context_photo_used`。

**迁移**（`backend/app/db/session.py`）新增列走 `ALTER TABLE ADD COLUMN`；
`monitor_points` 的经纬度改可空需要建新表-拷贝-改名，有"检测到旧的非空约束"守卫，
第二次启动是真正的 no-op；另有一次性的标靶回填，把旧的逗号分隔字符串搬进新表。

### 主要 API

```
POST   /api/points                          创建 + 自动分配标靶
GET    /api/points                          列表（含建档状态、最近已确认累计变化）
GET    /api/points/{id}                     详情
GET    /api/points/{id}/sticker.pdf         两页 A4 可打印复测贴
PUT    /api/points/{id}/context-photo       上传/更新现场全景
POST   /api/points/{id}/baseline            基线采集
GET    /api/points/{id}/history             历史记录
POST   /api/measure                         普通复测（新增 point / capture_mode 表单字段）
POST   /api/inspections/{id}/confirm        确认；基线确认时固化 baseline_inspection_id
POST   /api/inspections/{id}/ai-review       AI 复核（case_id 可选）
```

---

## 4. 关键设计决策及理由

这一节记录**为什么这么做**。改动这些之前请先读理由。

### 4.1 标靶 ID 由系统分配，不让用户填

早期设计让用户手填左右各 4 个整数。改成自动分配之后：唯一性由构造保证，
整块冲突校验、错误提示、表单校验分支都不用写，**代码反而更少**，
而且用户从来不需要理解这些数字。

### 4.2 异常门只作用于「较上次」，累计值不设上限

现有规则是 `abs(opening_delta) > 50.0` 判定为拒绝。它为**单期突变**设计。
累计值在长期监测下会合法超过 50 mm —— 如果套用同一条规则，一条被持续跟踪的裂缝
会在某天开始被系统拒绝，而且表现得像质量问题。

> 开发过程中有一次尝试给"首次复测"开豁免（因为那时 `previous` 就是 `baseline`，
> 两个数必然相等），被否决了：spec 没有这个豁免，该改的是测试而不是产品代码。
> 现在有两条测试分别钉住"累计不受限"和"首次复测同样受门控"。

### 4.3 现场全景归属点位，不是每次观测

依据：在 `backend/app/prompts/field_review_system.txt` 里，变化比较只发生在图2 与图3 之间
（判定顺序第 1 条），图1 只在第 24 条出现，作用是提示模型**不要**把场地固有特征
当成新增变化。它是背景常量，不是观测量。

而且 V0.4 界面本来就这么运作 —— 三图面板里只有"本次近景"有上传入口。

**已知风险**：全景会随汛期植被、堆物、排水状态变化而过期，过期全景会让 AI
把新出现的堆物误判为固定特征，导致**漏报**（比误报危险）。缓解措施是详情页可更新全景、
每条记录留存所用版本、超过 `CONTEXT_PHOTO_STALE_DAYS`（默认 90）给出提示。

### 4.4 只给 AI 一个数字

`run_field_review()` 的元数据只传 `opening_delta_mm`。**不要把累计值也加进去。**
系统提示词第 22 条正在专门对抗数值锚定，再加一个数只会加大风险。

### 4.5 相机标定是软门槛

`data/camera_profiles/default_camera.json` 是 `is_demo_profile: true` 的演示配置
（焦距写死 1500、畸变全 0）。未标定仍可完成全流程，但结果页、记录页、历史、列表
全部标注"未标定相机，毫米值仅供参考"，并把该标记持久化到 `Inspection.camera_profile_is_demo`，
使记录事后仍可分辨。

### 4.6 经纬度用表重建而非哨兵值

`DEMO_LOCATION_MODE` 默认为 true，会把点位坐标抄进检查记录。若用 `0.0` 当哨兵，
台账里就会出现一条"位于几内亚湾"的记录。宁可多做一次表重建。

---

## 5. 不可动摇的安全属性

后续任何改动都必须保住这三条，它们都有测试守着。

### 5.1 测量结果绝不能记到错的裂缝上

请求带显式 `point` 参数时：图像识别结果与之不一致 → 422 并指明真实归属；
识别不出点位 → 422，不猜、**不回退到 MP-03**。

守卫：`test_baseline_workflow.py::test_explicit_point_mismatch_is_refused`、
`::test_explicit_point_never_falls_back_to_the_demo_point`

### 5.2 绝不呈现绝对裂缝宽度或风险/预警/撤离结论

只输出相对位移。唯一例外是种子演示点 MP-03 的 `baseline_crack_width_mm`，
设计文档明确豁免；真实点位该字段为 `null`，界面遇 `null` 整块隐藏。

### 5.3 异常门只管单期

见 4.2。守卫：`::test_cumulative_value_is_not_capped_by_the_single_period_gate`、
`::test_single_period_gate_fires_on_the_first_recheck_too`

---

## 6. 如何测试

### 6.1 启动

```bash
# 跨平台一键（推荐）
.venv/bin/python scripts/run_dev.py

# 或分别启动
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
npm run dev --prefix frontend
```

打开 <http://127.0.0.1:5173>。

> **改完后端必须重启 uvicorn**（没有 `--reload`）。
> **改 `vite.config.ts` 必须重启 vite**（它不热重载自己的配置）。前端源码会热重载。

### 6.2 自动化验证（三套都要过）

```bash
.venv/bin/python -m pytest -q          # 期望 36 passed
npm run build --prefix frontend        # 期望 tsc + vite 均通过
npm run e2e --prefix frontend          # 期望 14 passed
```

E2E 通过 `webServer` 自行拉起服务（`reuseExistingServer: true`，已在跑就复用）。
首次需要 `npm exec --prefix frontend playwright install chromium`。

### 6.3 生成测试照片（不需要打印实体贴纸）

**关键**：合成照片里的 AprilTag 必须是该点位实际分配到的那 8 个 ID，否则系统认不出点位。

把下面这段存为 `scripts/make_point_photos.py`（目前**未提交**）：

```python
from __future__ import annotations
import argparse
from pathlib import Path
import cv2
from app.cv.synthetic import SyntheticCase, render_case
from app.db.session import SessionLocal
from app.models import MonitorPoint
from app.services.registry import boards_for_point

SHOTS = [
    ("01_baseline.png", 0.0, 8.0),
    ("02_recheck_plus2mm.png", 2.0, 12.0),
    ("03_recheck_plus5mm.png", 5.0, 18.0),
]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("monitor_point_id")
    parser.add_argument("--out", type=Path, default=Path("artifacts/demo_photos"))
    args = parser.parse_args()
    with SessionLocal() as session:
        point = session.get(MonitorPoint, args.monitor_point_id)
        if point is None:
            raise SystemExit(f"监测点 {args.monitor_point_id} 不存在。")
        boards = boards_for_point(point)
    out = args.out.expanduser() / args.monitor_point_id
    out.mkdir(parents=True, exist_ok=True)
    for name, delta_mm, yaw_deg in SHOTS:
        image, _ = render_case(
            SyntheticCase(name, delta_mm=delta_mm, yaw_deg=yaw_deg), seed=7, boards=boards
        )
        cv2.imwrite(str(out / name), image)
        print(f"wrote {out / name}  ({delta_mm:+.1f} mm, yaw {yaw_deg:.0f}deg)")

if __name__ == "__main__":
    main()
```

```bash
PYTHONPATH=backend .venv/bin/python scripts/make_point_photos.py MP-W02 --out ~/Desktop/geo-demo-photos
```

### 6.4 手动验收剧本

1. 「裂缝管理」→「新建监测点」，填七个字段提交。
   **表单里不应出现任何要人填标靶 ID 的字段** —— 系统自动分配。
2. 详情页应显示：标靶 ID（左 4 / 右 4）、状态「未建档」、「下载复测贴 PDF」链接。
3. 「采集基线」→ 上传 `01_baseline.png`（拖拽或点击面板均可）→
   结果页应显示「**基线已建立**」而**不是**两个 0.0 mm → 确认。
4. 回详情页，状态变「已建档」，按钮变「开始复测」。
5. 上传 `02_recheck_plus2mm.png` → 应显示 **较基线累计 +2.0 mm / 较上次 +2.0 mm** → 确认。
6. 上传 `03_recheck_plus5mm.png` → 应显示 **较基线累计 +5.0 mm / 较上次 +3.0 mm**。
   **两个数字不同**是本次迭代的核心产出。
7. 「一分钟演示」应与 V0.4 行为完全一致，五个 Demo Case 都能跑。

### 6.5 物理闭环（可选）

打印 `sticker.pdf` **必须 100% 比例，不能"适应页面"**，打完用尺量那条 100 mm 边 ——
打印机缩到 98%，所有毫米值就系统性偏 2%。贴到硬质衬底（PVC / 相纸 / 覆膜；
普通不干胶卷边会破坏平面假设），左右两块贴在裂缝两侧**同一平面**。

实拍前应先用 ChArUco 板做一次相机标定（`scripts/generate_charuco.py` 出图，
「演示设置 → 相机标定」上传 15–25 张）。

### 6.6 预期中的"看起来像 bug"的行为

| 现象 | 说明 |
|---|---|
| 毫米值旁的红色「未标定相机」 | 正常，见 4.5 |
| 未建档就复测 → 422 | 设计如此 |
| 真实点位 AI 复核报错 | 需 `STEPFUN_AI_REVIEW_ENABLED=true` + 有效 key，且该点位先上传过现场全景。基线采集不提供 AI 复核 |
| 复测贴 PDF 上没有构筑物名称 | 有意为之。reportlab 的 Helvetica 无中文字形会渲染成黑方块，已移除该字段 |

### 6.7 测试数据卫生

- 后端测试套**共用 `data/geo_recheck.db`**（`DATABASE_PATH` 没有环境变量覆盖）。
  `backend/tests/conftest.py` 的 autouse fixture 在每个测试后清掉
  `MP-T*` / `MP-BL*` / `MP-AI*` 前缀的点位。**新增测试若创建点位，编号必须落在这三个前缀内。**
- **E2E 会留下垃圾数据**：`point-lifecycle.spec.ts` 用 `MP-E2E-${Date.now()}` 造点位，
  不在上述前缀内，跑一次留一个。见遗留项 1。

### 6.8 一个不要误判的现象

如果"点击上传按钮完全没反应"：先查 `ps aux | grep -i chrome | grep ms-playwright-mcp`。
Playwright MCP 会驱动一个**真实可见的 Chrome 窗口**并注册 `filechooser` 拦截器，
把系统文件对话框截走挂成待处理状态，表现就是点了没反应。这不是应用问题。

同理，用 `fileChooser.setFiles()` 验证上传，只能证明"input 收到文件后处理正常"，
**不能证明真人点击会弹出对话框**。这两件事要分开验。

---

## 7. 如何接续开发

### 7.1 立刻可做：清掉遗留项

按优先级（终审判定全部可合并后处理）：

1. **E2E 不清理自己造的点位** —— `MP-E2E-*` 持续堆积在管理列表。
   建议在 `point-lifecycle.spec.ts` 加 `test.afterEach` 调用删除接口，
   或把前缀改成 conftest 覆盖的 `MP-T*` 并加一个后端清理端点。
2. **`DATABASE_PATH` 无环境变量覆盖**（`backend/app/config.py:27`）——
   测试直接写开发者的真实库。加一个 `GEORECHECK_DB` 覆盖即可。
3. **`_backfill_marker_assignments` 每次启动无守卫重跑**（`db/session.py`），
   `INSERT OR IGNORE` 会掩盖跨点位的 ID 冲突而不是暴露它。
4. **`DROP INDEX` 拼接未加引号的标识符**（`db/session.py:99`），来源是 `sqlite_master`。
5. **`registry.marker_ids()` 已成死代码**，全仓无调用者。
6. **`scan_marker_ids` 重复了一次 undistort + detect**（`cv/pipeline.py`），
   `measure_image` 随即再做一遍。有意的取舍，但可优化（例如让 `measure_image`
   接受预先算好的 detection）。
7. **`out_of_plane_delta`** 现在是瞬时 z 偏移却仍叫 `_delta_mm`。下游无消费者。
8. **`context_photo_used`** 存的是每点位恒定的路径（上传原地覆盖 `context.jpg`），
   记录的是"哪个点位的全景"而非"哪个版本"。
9. **`seed_baseline` 的守卫**依赖 `point.baseline_inspection_id == existing.id`；
   链接失效会删除并重建种子记录。当前 API 路径不可达。
10. **`playwright.config.ts` 写死 `../.venv/bin/python`**，未尊重
    `docs/MACOS.md` 宣传的 `GEORECHECK_PYTHON` 覆盖。
11. **`RecordPage` 直接打印原始 `scene_type`**（`wall_crack_recheck`）。
12. **`context_photo_is_stale` 无测试覆盖** —— 90 天边界和空值分支都没测。
13. **加固**：`create_measurement` 不拒绝同时携带 `point` 与 `demo_case_id` 的请求，
    会把 `demo_case_id` 盖到真实点位的记录上。当前前端无路径构造它，
    但这条前端约束是那份安全性的唯一依靠 —— 应该在后端也拒绝。

两条经核查判定**不可达、不必处理**：经纬度只有一半为空导致的 `_haversine_m` TypeError
（新建表单不暴露坐标字段）、`_rebuild_monitor_points` 只拷贝 `LEGACY_POINT_COLUMNS`
（重建只在 pre-V0.5 库上触发，那四个新列在同一事务中刚以 NULL 添加）。

### 7.2 设计文档已经写好、但推迟到 V0.6 的

- **多场景受控精度验证**：10 个人工审核的公开墙面场景 × 6 种用例 = 60 张图，
  逐场景输出 MAE / P95 / 拒绝率。原实施计划的 Task 5 有完整步骤，
  移出 MVP 是因为它证明的是精度而 MVP 要证明的是链路。
- **标靶重贴后的重新建档**：目前已建档的点位再次发起基线采集会 422。
- **真实相机标定后的 0/2/5/10 mm 物理位移实验**。

### 7.3 如果要加新能力，从哪里下手

| 想做的事 | 入口 |
|---|---|
| 改测量算法 | `backend/app/cv/` —— `pipeline.py` 编排，其余模块单一职责 |
| 改点位/标靶语义 | `backend/app/services/registry.py` |
| 改比较语义、门控、状态机 | `backend/app/services/inspection.py` |
| 改 AI 复核 | `backend/app/services/ai_review.py` + `backend/app/prompts/field_review_system.txt` |
| 加 API | `backend/app/main.py`（薄控制器，业务在 services） |
| 加页面 | `frontend/src/pages/` + `App.tsx` 路由 + `AppShell.tsx` 导航 |
| 改数据模型 | `backend/app/models/entities.py` + `backend/app/db/session.py` 的迁移 |

### 7.4 工作方式建议

这条分支是用「设计 → 计划 → 逐任务实现 → 逐任务评审 → 全分支终审」的流程做的，
有几个经验值得沿用：

- **先读 spec 再读 plan**。冲突时 spec 是权威。
- **分任务评审看不到跨任务缝隙**。终审抓到的那条误归属路径
  （`ResultPage` 硬编码 demo 路由）就是明证 —— 五个任务的评审都漏了它。
  改动多个任务共同触碰的文件（`registry.py`、`main.py`、`ResultPage.tsx`）时要特别小心。
- **测试写错了就改测试，不要改产品代码去迁就它**。见 4.2 那个例子。
- **遇到"看起来像应用 bug"的现象，先排除工具干扰**。见 6.8。

### 7.5 合并

分支尚未合并，目标 `main`（当前 `d6e6b5c`）。合并前建议重跑 6.2 的三套验证。

---

## 8. 陷阱清单

| 陷阱 | 后果 |
|---|---|
| 改后端不重启 uvicorn | 看到的是旧行为，会误判为 bug |
| 改 `vite.config.ts` 不重启 vite | 新的代理路径不生效 |
| 新增测试用了 `MP-T*`/`MP-BL*`/`MP-AI*` 之外的点位编号 | 数据残留，第二次跑挂 |
| 给累计值加异常门 | 长期跟踪的裂缝会开始被系统拒绝 |
| 把累计值也传给 AI | 加剧数值锚定，违反 prompt 第 22 条的设计意图 |
| 在 `MonitorPoint.left_marker_group` 上读标靶 | 那是遗留字段，只写不读；事实来源是 `marker_assignments` |
| 直接改 `BoardSpec.marker_ids` 的顺序 | 顺序决定标靶在板上的物理坐标，位姿会算错 |
| 打印复测贴时用"适应页面" | 缩放误差 1:1 变成测量误差 |
| 用 `fileChooser.setFiles()` 断言"上传功能正常" | 证明不了真人点击能弹框 |
