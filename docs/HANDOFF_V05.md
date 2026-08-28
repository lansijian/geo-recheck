# V0.5 交接文档：固定裂缝复测 MVP

> 面向接手的工程 agent。本文描述分支 `feat/fixed-crack-recheck-mvp` 的当前状态、
> 一个已确认待修的缺陷、一个无法复现的报告，以及后续该如何测试。
>
> 撰写时间：2026-08-28。分支 head：`7026a38`。**尚未合并到 `main`。**

---

## 1. 分支状态

`feat/fixed-crack-recheck-mvp`，14 个 commit，41 文件 +4459/−186，从 `main` 的 `d6e6b5c`（V0.4）分出。

```
7026a38 fix: close four pre-merge safety gaps in point management, retake flow, sticker PDF, and baseline record text
423b51a fix: let a real point's recheck reach AI field review from the browser
0494885 feat: extend AI field review to user-created points
ff7fa85 fix: stop rendering absolute distances and zero-baseline deltas as measurements
4678f3c feat: add crack point management UI and cross-platform e2e
0e9a7ab fix: validate capture_mode and pin the no-fallback guarantee with a real test
bc2c72c docs: fix the cumulative-gate test so it can distinguish its two subjects
ea71f63 fix: restore the plain 50mm gate and fix the test that mis-described it
c1afdc2 feat: add baseline state machine and cumulative-plus-period deltas
182dd7f docs: carry the SQLite stale-index fix back into the plan
e10abef fix: preserve marker_assignments FK across the monitor_points rebuild
1b777f7 feat: allocate unique marker blocks per point and emit printable stickers
247849e feat: measure arbitrary board pairs instead of hardcoded demo tags
fdd77b9 docs: revise fixed-crack-recheck MVP spec and implementation plan
```

验证状态（在 head 上实测）：后端 `pytest` **36 passed**，`npm run build --prefix frontend` 通过，
Playwright E2E **13 passed**。

设计与计划：
- 设计（权威）：`docs/superpowers/specs/2026-08-28-fixed-crack-recheck-mvp-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-28-fixed-crack-recheck-mvp.md`

### 这次迭代交付了什么

| 能力 | 位置 |
|---|---|
| `measure_image()` 按点位的标靶规格测量，不再写死 301–308 | `backend/app/cv/pipeline.py` |
| 标靶 ID 全局唯一由主键保证；建点自动分配连续 8 个空闲 ID | `backend/app/models/entities.py`、`services/registry.py` |
| 可打印复测贴 PDF（两页 A4） | `backend/app/services/sticker_pdf.py` |
| 基线状态机；未建档拒绝普通复测 | `backend/app/services/inspection.py` |
| 双数字：较基线累计 + 较上次；异常门只作用于单期 | 同上 |
| 图像认点与请求指定点不一致时 422，永不回退 | 同上 |
| 裂缝管理列表 / 新建 / 详情三页 | `frontend/src/pages/Points*.tsx` |
| AI 现场复核泛化到真实点位 | `backend/app/services/ai_review.py` |
| macOS + Windows 同一套启动与 E2E | `scripts/run_dev.py`、`frontend/e2e/helpers.ts` |

### 两条不可动摇的安全属性

后续任何改动都必须保住这两条，它们有测试守着：

1. **测量结果绝不能记到错的裂缝上。** 请求带显式 `point` 参数时，图像识别结果不一致
   → 422 并指明真实归属；识别不出 → 422，不猜、不回退到演示点 MP-03。
   守卫测试：`backend/tests/test_baseline_workflow.py::test_explicit_point_mismatch_is_refused`
   与 `::test_explicit_point_never_falls_back_to_the_demo_point`。
2. **绝不呈现绝对裂缝宽度或风险/预警/撤离结论。** 只输出相对位移。
   唯一例外是种子演示点 MP-03 的 `baseline_crack_width_mm`，设计文档明确豁免。

另有一条容易被误改：**50 mm 异常门只作用于「较上次」，累计值不设上限。**
长期跟踪的裂缝累计合法超过 50 mm；若把门加到累计值上，系统会开始拒绝它本该监测的对象。
守卫测试：`::test_cumulative_value_is_not_capped_by_the_single_period_gate` 与
`::test_single_period_gate_fires_on_the_first_recheck_too`。

---

## 2. 待修缺陷：拍摄页的大面板假装自己是拖拽上传区

**状态：已确认、可复现、尚未修复。这是唯一需要你动手的代码缺陷。**

### 现象

在拍摄页（`/capture?...`，无论演示模式还是点位模式），把图片拖到中间那个大面板上没有任何反应；
点击该面板也没有反应。唯一能上传的控件是面板上方那个较小的「上传本次近景」按钮。

### 根因

V0.4 重写 `CapturePage.tsx` 时（commit `28af59f`）删除了 V0.3 的拖拽实现。V0.3 原本是：

```jsx
// V0.3 (08737cb) frontend/src/pages/CapturePage.tsx:180 — 已被删除
<div className={`camera-panel wall-photo-panel drop-zone ${dragging ? "dragging" : ""}`}
     onDragOver={...} onDragLeave={...} onDrop={...}>
```

当前代码里 `onDrop` / `onDragOver` / `drop-zone` 的命中数为 **0**。

但删除时留下了两处，共同制造了一个说谎的可供性：

1. `frontend/src/pages/CapturePage.tsx:204` 的面板本身没有任何事件处理器；
2. `frontend/src/pages/CapturePage.tsx:206` 的空态文案是
   「让墙缝和左右复测贴完整入镜 / **JPG、PNG、WebP，最大 20 MB**」——
   报出接受格式与体积上限，在任何界面语言里都表示"往这儿拖"；
3. `frontend/src/styles.css:93` 的 `.camera-panel.dragging` 高亮样式仍在，但没有任何 JS 会加这个 class，
   是死代码。

所以面板看起来是上传区，实际不是。

**注意：这不是 `feat/fixed-crack-recheck-mvp` 引入的。** 本分支的五个任务没有一个碰过该区域，
是 V0.4 遗留、被真实使用暴露出来的。

### 建议修法

范围：`frontend/src/pages/CapturePage.tsx` 一个文件，加一条 E2E。不要碰后端。

1. 给 `camera-panel` 加回 `onDragOver` / `onDragLeave` / `onDrop`，
   复用已存在的 `handleSelected(file)`（不要新写一套校验逻辑，它已经处理了类型、
   体积、尺寸读取与错误提示）；
2. 加 `dragging` state，让 `styles.css:93` 那条已写好的高亮重新生效；
3. 让面板同时可点击触发文件选择 —— 既然文案已经这么暗示；
4. 在 `frontend/e2e/` 补一条用例：向面板派发一个带文件的 drop 事件，
   断言 `[data-testid="upload-preview"]` 出现且「开始分析」按钮变为可用。

**不要破坏的东西**：一分钟演示和五个 Demo Case 走的是自动加载图片的路径
（`loadCase()`），不经过上传控件。改完必须确认 `npm run e2e --prefix frontend` 仍然 13 项全过。

---

## 3. 一个不要浪费时间去追的"缺陷"

使用者报告"点击上传按钮完全没反应"。**这不是应用的问题，是工具干扰。**

当时有一个 Playwright MCP 会话在驱动一个**真实可见的 Chrome 窗口**
（`--user-data-dir=~/Library/Caches/ms-playwright-mcp/mcp-chrome-*`），也就是使用者正在点的那个窗口。
MCP 注册了 `filechooser` 拦截器，于是每一次点击触发的系统文件对话框都被截走、排入待处理队列，
从未弹到使用者面前。表现就是"点了没反应"，而且点得越多队列越长。

**判别方法**：`ps aux | grep -i chrome | grep ms-playwright-mcp` 有输出，就说明有 MCP 会话
正占着浏览器。此时不要去改 `CapturePage` 的上传逻辑 —— 那条链路是好的。

**经验教训**：用 Playwright 的 `fileChooser.setFiles()` 验证上传，只能证明
"input 收到文件后处理正常"，**不能证明真人点击会弹出对话框**。这两件事要分开验。

---

## 4. 一个无法复现的报告

使用者报告：点击「裂缝管理 → 采集基线」时自动跳到了一分钟演示页。

已排查，**未能复现，且代码中不存在该路径**：

- 在独立无头浏览器中完整走「一分钟演示 → 裂缝管理 → MP-W02 → 采集基线」：
  落在正确页面，标题为「采集基线：<点位名>」，无案例选择器、无案例三图面板、
  无残留预览，「开始分析」为禁用。原先怀疑的"组件状态跨同路径路由残留"被证伪
  （React Router 在经过 `/points` 路由时会卸载并重挂 `CapturePage`）。
- 四种 URL 变体（点位不存在 / 带 mode / 不带 mode / 全裸 `/capture`）：
  URL 全部原地不动，无任何重定向；点位不存在时只显示「监测点不存在。」错误，不跳转。
- `CapturePage.tsx` 中唯一的 `navigate()` 调用在 `submit()` 成功后跳向 `/result/:id`；
  唯一的 `setSearchParams()` 在 `chooseCase()` 内，且被 `isDemo && !pointId` 条件保护。

**最可能的解释**：上一节的工具干扰让页面显得没反应，而导航栏里「一分钟演示」紧挨着「裂缝管理」，
误点很容易发生。

**如果它再次复现**，请记录当时**地址栏的完整 URL** 再来定位 —— 那能立刻区分是路由问题还是误点。

---

## 5. 如何测试

### 5.1 启动

```bash
# 后端
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
# 前端（另一个终端）
npm run dev --prefix frontend
```

或跨平台一键：`.venv/bin/python scripts/run_dev.py`

打开 <http://127.0.0.1:5173>。

> **重要**：改完后端必须重启 uvicorn（没有 `--reload`）。改 `vite.config.ts` 必须重启 vite
> （它不热重载自己的配置）。改前端源码 vite 会热重载。

### 5.2 自动化验证（三套都要过）

```bash
.venv/bin/python -m pytest -q          # 期望 36 passed
npm run build --prefix frontend        # 期望 tsc + vite 均通过
npm run e2e --prefix frontend          # 期望 13 passed
```

E2E 会通过 `webServer` 自行拉起服务（`reuseExistingServer: true`，已在跑就复用）。
Playwright chromium 需已安装：`npm exec --prefix frontend playwright install chromium`。

### 5.3 手动验证新功能：不需要打印实体贴纸

关键点：**合成照片里的 AprilTag 必须是该点位实际分配到的那 8 个 ID**，否则系统认不出点位。
用下面这个脚本按点位生成配套照片。

```python
# 保存为 scripts/make_point_photos.py（当前未提交，需要请自行落盘）
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

运行：

```bash
PYTHONPATH=backend .venv/bin/python scripts/make_point_photos.py MP-W02 --out ~/Desktop/geo-demo-photos
```

### 5.4 手动验收剧本

1. 顶部导航「裂缝管理」→「新建监测点」，填七个字段提交。
   **系统自动分配标靶 ID，表单里不该出现任何要人填 ID 的字段。**
2. 详情页应显示：标靶 ID（左 4 个 / 右 4 个）、状态「未建档」、「下载复测贴 PDF」链接。
3. 点「采集基线」→ 用上方的**「上传本次近景」按钮**（拖拽目前无效，见第 2 节）上传
   `01_baseline.png` → 结果页应显示「**基线已建立**」，**不是**两个 0.0 mm → 确认。
4. 回详情页，状态变「已建档」，按钮变「开始复测」。
5. 复测上传 `02_recheck_plus2mm.png` → 应显示 **较基线累计 +2.0 mm / 较上次 +2.0 mm** → 确认。
6. 再复测上传 `03_recheck_plus5mm.png` → 应显示 **较基线累计 +5.0 mm / 较上次 +3.0 mm**。
   **两个数字不同**是本次迭代的核心产出，务必确认。
7. 顶部「一分钟演示」应与 V0.4 行为完全一致，五个 Demo Case 都能跑。

### 5.5 预期中的"看起来像 bug"的行为

| 现象 | 说明 |
|---|---|
| 毫米值旁的红色「未标定相机」 | 正常。`data/camera_profiles/default_camera.json` 是 `is_demo_profile: true` 的演示配置（焦距写死 1500、畸变全 0）。要消除需走「演示设置 → 相机标定」用 ChArUco 板真标定。 |
| 未建档就复测 → 422 | 设计如此，提示先建档。 |
| 真实点位 AI 复核报错 | 需 `.env.local` 设 `STEPFUN_AI_REVIEW_ENABLED=true` + 有效 key，且该点位**先上传过现场全景**。基线采集不提供 AI 复核（没有"上次近景"可比）。 |
| 复测贴 PDF 上没有构筑物名称 | 有意为之。reportlab 用的 Helvetica 无中文字形，会渲染成黑方块；已移除该字段。点位编号与 8 个标靶 ID 仍在。 |
| 拖拽图片无反应 | 见第 2 节，待修。 |

### 5.6 测试数据卫生

- 整个后端测试套**共用 `data/geo_recheck.db`**（`DATABASE_PATH` 没有环境变量覆盖）。
  `backend/tests/conftest.py` 的 autouse fixture 会在每个测试后清掉
  `MP-T*` / `MP-BL*` / `MP-AI*` 前缀的点位。**新增测试若创建点位，编号必须落在这三个前缀内。**
- **E2E 目前会留下垃圾数据**：`frontend/e2e/point-lifecycle.spec.ts` 用 `MP-E2E-${Date.now()}`
  造点位，不在上述清理前缀内，跑一次留一个。已知问题，见下节。

---

## 6. 已知遗留项（终审判定均可合并后处理）

按大致优先级：

1. **E2E 不清理自己造的点位** —— `MP-E2E-*` 会持续堆积在管理列表里。
2. **`DATABASE_PATH` 无环境变量覆盖**（`backend/app/config.py`）—— 测试直接写开发者的真实库。
3. **`_backfill_marker_assignments` 每次启动无守卫重跑**（`backend/app/db/session.py`），
   `INSERT OR IGNORE` 会掩盖跨点位的 ID 冲突而不是暴露它。
4. **`DROP INDEX` 拼接未加引号的标识符**（`backend/app/db/session.py:99`），来源是 `sqlite_master`。
5. **`registry.marker_ids()` 已成死代码**，全仓无调用者。
6. **`scan_marker_ids` 重复了一次 `undistort` + `detect`**（`backend/app/cv/pipeline.py`），
   `measure_image` 随即再做一遍，每次上传约多花一倍 CV 时间。有意的取舍（保持 `pipeline.py`
   不依赖数据库），但可优化。
7. **`out_of_plane_delta`** 现在是瞬时 z 偏移，却仍用 `_delta_mm`（"较…变化"）命名。
   下游无消费者。
8. **`context_photo_used`** 存的是每点位恒定的路径（上传会原地覆盖 `context.jpg`），
   所以它记录的是"哪个点位的全景"而非"哪个版本"。
9. **`seed_baseline` 的守卫**依赖 `point.baseline_inspection_id == existing.id`；链接若失效会
   删除并重建种子记录。当前 API 路径不可达。
10. **`playwright.config.ts` 写死 `../.venv/bin/python`**，未尊重 `docs/MACOS.md` 宣传的
    `GEORECHECK_PYTHON` 覆盖。
11. **`RecordPage` 直接打印原始 `scene_type` 字符串**（`wall_crack_recheck`）。
12. **`context_photo_is_stale` 无测试覆盖** —— 90 天边界和空值分支都没测。
13. **加固建议**：`create_measurement` 不拒绝同时携带 `point` 与 `demo_case_id` 的请求，
    会把 `demo_case_id` 盖到真实点位的记录上。当前前端无路径构造它
    （`CapturePage` 在 `pointId` 存在时把 `demo_case_id` 传 `undefined`），
    但这条前端约束是那份安全性的唯一依靠。

两条曾被列为缺陷、经核查判定为不可达，**不必处理**：
- 经纬度只有一半为空导致 `_haversine_m` TypeError —— 新建点位表单不暴露坐标字段，用户点位两者恒为空。
- `_rebuild_monitor_points` 只拷贝 `LEGACY_POINT_COLUMNS` —— 重建只在 pre-V0.5 库上触发，
  而那四个新列在同一事务中刚以 NULL 添加。

---

## 7. 移交给你的第一件事

按第 2 节修好拖拽上传，跑通第 5.2 节的三套验证，然后按第 5.4 节手动走一遍验收剧本。

分支尚未合并；合并目标是 `main`（当前 `d6e6b5c`）。
