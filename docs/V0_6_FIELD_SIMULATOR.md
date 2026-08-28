# GeoReCheck V0.6 Field Inspector Simulator

## 1. 版本目标

V0.6 在 V0.4/V0.5 已有的 React、FastAPI、OpenCV 几何复测、质量门控、StepFun 可见变化复核、SQLite 持久化和人工确认之上，增加一个可操作的现场巡查模拟器。它没有改写几何算法，也没有把三维动画包装成测量来源。

模拟器用于说明一条完整、可审计的基层巡查链路：巡查员到达现场、拍摄全景和近景、得到几何与 AI 辅助结果、亲自确认，再形成正式记录。

## 2. 用户看到的五个步骤

1. **到达现场**：巡查员沿路径走向统一的房屋、挡墙、排水沟和裂缝点。
2. **手机采集**：相机切换机位，闪光后把 WebGL 画布快照送入手机；全景和近景来自同一个三维现场。
3. **辅助分析**：FastAPI/OpenCV 真实完成本次几何测量；成功的 StepFun 实测响应以 Hybrid Replay 方式载入。
4. **人工确认**：自动播放停止，等待监测员填写姓名、备注并接受或不采纳 AI 条目。
5. **生成记录**：后端把实际人工输入、几何结果、AI 处置和证据路径写入 SQLite，并返回真实记录编号。

界面内部使用 13 个状态，以便分别控制人物、相机、手机和说明栏：

```text
task → walking → arrive → inspect_context → raise_phone
→ capture_context → approach_crack → capture_closeup
→ geometry → ai_review → result → human_confirm → record
```

对外只展示“到达、采集、分析、确认、记录”五个阶段，内部状态不改变产品叙事。

## 3. Canonical Field Scene

`frontend/src/components/showcase/ShowcaseScene.tsx` 使用 Three.js、React Three Fiber 和 Drei 程序化生成统一现场：

- 起伏地形；
- 房屋、屋顶、门窗；
- 挡土墙与排水沟；
- 巡查路径和裂缝复测点；
- 低多边形巡查员、手臂和手机；
- 三种主要相机机位：远景、全景采集、裂缝近景；
- 快门闪光、WebGL 截图和截图飞入手机；
- 结果阶段的受控变化区域提示。

人物位置通过帧循环平滑移动，相机位置与观察目标同样由状态机驱动。近景裂缝平面使用当前案例的真实案例图作为纹理，因此手机截取的全景和近景在空间叙事上属于同一个现场，而不是两张互不相关的页面插图。

受控 ROI 是演示数据制作范围的披露，不是模型自动定位框。界面明确显示“受控演示变化区域”。

## 4. 单一数据源

V0.6 不在 React 组件里手写 `+4.8 mm`、水迹或剥落结论。运行：

```bat
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe scripts\build_showcase_data.py
```

生成器读取：

- `data/demo_cases/<case>/metadata.json`：案例来源、资产和受控变化；
- `artifacts/validation_v04_cases/results.json`：真实 OpenCV 验证结果；
- `artifacts/ai_validation_v04/results.csv`：StepFun 实测运行索引；
- `artifacts/ai_validation_v04/responses.jsonl`：StepFun 原始成功响应。

它为五个案例生成 `data/demo_cases/<case>/showcase.json`。前端从 `/api/showcase/cases` 读取这些文件；后端 AI 回放也读取同一份生成物，并校验其响应来源必须是 `artifacts/ai_validation_v04/responses.jsonl`。

如果源验证结果变化，应重新运行生成器并提交更新后的 `showcase.json`，避免展示值与可审计产物分叉。

## 5. Hybrid Replay 的真实边界

默认模式不是全离线假动画，也不是每次都调用外部模型：

- **几何链实时**：进入分析状态时，前端把案例本次近景发送给 `/api/measure`；后端真实执行质量门控、标志检测、校正和几何计算，并创建本次 inspection。
- **数据库实时**：AI 回放条目、人工处置和最终记录都在本次运行中写入 SQLite。
- **AI 响应回放**：`/api/inspections/{id}/ai-review/replay` 从成功的真实 StepFun 验证产物恢复结构化响应，保留 provider、model、原始延迟、尝试次数和采集时间。
- **实时 AI 可选**：监测员必须显式点击“运行实时 AI（预计 30–60 秒）”才调用外部 StepFun。超时、网络、额度或模型错误只影响 AI 辅助，不删除已完成的几何结果。

页面持续显示 Hybrid Replay 标识，不能把历史响应描述为本次实时模型调用。

## 6. 人工确认与记录

自动播放到 `human_confirm` 后必定停止。系统不会预填人工决定，也不会自动生成正式记录。

生成记录前必须具备：

- 非空记录人姓名；
- 巡查备注；
- 对 AI 可见变化条目的人工决定。

确认时前端先逐条提交 AI 决定，再调用原有确认接口。最终记录页显示后端返回的真实 UUID、记录人、备注、几何结果和已采纳的 AI 条目。未采纳条目不会被伪装成正式现场事实。

## 7. Before/After 与两次拍摄

手机结果页提供可拖动的 Before/After 滑块。上次近景和本次近景是两个不同资产、不同拍摄角度；几何复测仍通过复测标志和透视校正建立可比坐标，而不是要求两张图片逐像素相同。

质量失败案例保留原有门控：质量未通过时不输出毫米值，也不能进入正式确认。

## 8. 本地运行

项目的一键启动脚本固定使用用户指定的 Python 环境：

```bat
一键启动前后端.cmd
```

双击或在 CMD 中运行后，会启动：

- 后端：<http://127.0.0.1:8000>
- 现场模拟器：<http://127.0.0.1:5173/showcase>

脚本等待两个服务就绪后自动打开 Chrome。窗口必须保持开启；按 `Ctrl+C` 可同时停止前后端。

首次克隆可运行：

```bat
set GEORECHECK_PYTHON=D:\Anaconda\_envs\PulseWeave\Scripts\python.exe
scripts\setup_windows.cmd
一键启动前后端.cmd
```

## 9. 验收截图

| 状态 | 截图 |
|---|---|
| 巡查员行走 | ![Field walk](assets/v06-field-walk.png) |
| 手机采集 | ![Phone capture](assets/v06-phone-capture.png) |
| AI 辅助结果 | ![AI result](assets/v06-ai-result.png) |
| 等待人工确认 | ![Human confirmation](assets/v06-human-confirm.png) |
| 正式巡查记录 | ![Record](assets/v06-record.png) |

这些截图来自本地前后端实际运行和浏览器操作，不是设计稿。

## 10. 验证命令

```bat
set GEORECHECK_PYTHON=D:\Anaconda\_envs\PulseWeave\Scripts\python.exe
%GEORECHECK_PYTHON% -m pytest -q
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm run e2e --prefix frontend
```

V0.6 浏览器测试覆盖：WebGL 画布和三栏布局、人物与相机状态变化、真实几何请求、AI 回放、Before/After、自动播放停在人工确认、实际人工输入进入正式记录，以及实时 AI 失败不影响几何结果。

## 11. 未完成与禁止外推

V0.6 仍是受控本地 PoC，尚未完成：

- 真实基层监测员 shadow mode；
- 实体复测贴长期贴装和野外尺寸验证；
- 真实相机标定后的物理位移精度实验；
- 室外复杂光照、遮挡、雨雾、距离和多设备验证；
- 三维现场与真实地形测绘数据的配准；
- 生产部署、权限体系、远程同步与正式告警联动。

本系统不预测滑坡，不判断现场是否安全，不输出风险等级、预警或撤离建议，不替代基层监测员、专业监测设备或正式决策流程。
