# V0.3 Scene Fidelity Changelog

日期：2026-08-28  
分支：`feature/v0.3-scene-fidelity`  
冻结基线：`v0.2-demo-ready`

## 保留的 V0.2 能力

- React / FastAPI 架构、图片上传与摄像头入口。
- AprilTag 检测、PnP、质量门控、持久化、人工确认与影像证据。
- 结果恢复、记录页、标定页、计时对比页和 Playwright 回归。

## V0.3 变更

- Golden Path 只保留“贵州仁怀 · 墙体裂缝复测（公开场景复原）”，裂缝编号为 `CRACK-W01`。
- 首页、`/scenario` 与 `/technology` 改为真实岗位故事优先；标定与计时页面移入次级“演示设置”。
- Golden Path 墙面换为 Özgenel Concrete Crack Segmentation Dataset 的 `rgb/328.jpg`，许可证为 CC BY 4.0；CrackForest 只保留为 legacy regression。
- 新增官方数据下载、场景筛选、受控墙面仿真与 V0.3 A/B 验证脚本。
- 墙体纹理、裂缝、左贴、右贴在同一个 2000×1200 canonical plane 中生成；右侧墙体与右贴共同发生位移，最后统一施加相机变换。
- 视觉复测贴改为 100×60 mm 工程贴片，保留每侧 4 个小型 AprilTag，并加入裂缝编号、左右方向、十字和箭头。
- 用户主指标从绝对板中心距改为 `opening_delta_mm`，同时输出可选 `shear_delta_mm`；绝对距离仅作为折叠技术诊断。
- 新增 `planar_rectified_2d`，保留 `dual_pnp_3d` 相对变换做 A/B。Golden Path 根据受控测试选择前者。
- Inspection 增加裂缝、场景、基准开度、张开/剪切/面外变化、测量模式、检测器与数据溯源字段，并用增量 SQLite 迁移保持 V0.2 数据兼容。
- 结果页与记录页改为人话优先，加入上次/本次墙面证据、受控基准开度说明及人工确认后的自动留痕。

## 明确边界

- 真实人物与工作流来自公开报道；墙体照片来自公开数据集；毫米位移来自受控仿真，均非真实贵州监测数据。
- 系统不预测灾害、不输出风险等级、不替代巡查或自动化监测设备。
- AI 裂缝分割默认关闭，且不参与毫米测量或风险判断。
