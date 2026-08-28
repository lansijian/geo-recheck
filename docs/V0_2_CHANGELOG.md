# V0.2 变更记录

日期：2026-08-28

## 浏览器闭环

- 首页增加“一键演示：+5 mm / 20°”；自动加载照片、显示处理态、调用真实 `/api/measure` 并导航到持久结果 URL。
- Capture 将“使用摄像头”和“上传照片”提升为两个主入口；增加点击上传、拖拽上传、格式/20 MB 校验、文件名、分辨率、大小、格式和明确错误状态。
- 结果路由改为 `/result/:inspection_id`；页面加载时真实 GET inspection，刷新或复制 URL 后不依赖 route state/sessionStorage 恢复结果。
- Result 以原图、检测叠加图和正视化图为核心区域，三图支持点击放大；增加 Marker、点位、构筑物、角度、PnP RMSE、边长和相机配置展示。
- 确认后自动进入 `/record/:inspection_id`；记录页展示原图、overlay、rectified 和明确质量状态。

## 后端与证据

- 增加 `/media` 静态资源入口，API 返回浏览器可访问的 HTTP 相对 URL；保留 `/evidence` 兼容旧记录。
- accepted measurement 生成并验证 `original`、`undistorted`、`overlay`、`rectified_left`、`rectified_right` 和 canonical `rectified`；任一必需文件缺失或为空时不返回成功。
- 上传日志记录原始 filename、保存目录、图片尺寸和 detected marker ids。
- 状态统一为 `pending / confirmed / rejected`；只有 confirmed 记录进入下一期历史值查询。
- 质量诊断通过现有 JSON 文本字段持久化，没有新增表、数据库迁移或复杂架构。

## 空状态和辅助页面

- Benchmark 零数据时显示明确说明；传统流程增加点位、上一期值、人工值、变化和现场照片输入；系统流程沿用真实上传与确认链路。
- Calibration 增加多图缩略图、fx/fy/cx/cy、distortion、RMSE 和状态区；ChArUco PDF 已在浏览器中返回 200。
- 未增加 AI 模型、云端、账号、权限、GIS、预警、Docker 或数据库迁移。

## 验证

- Playwright 核心测试 5 条：主页、一键 Demo、真实上传、确认记录、结果刷新。
- Playwright 重复性测试：连续 10 次完整 Golden Path，每轮检查结果页和记录页三张图片 `naturalWidth > 0`。
- 最终截图位于 `artifacts/ui_audit/01_home.png` 至 `07_calibration.png`。

## 仍然存在的物理验证边界

- 默认相机仍是 Demo Profile。
- 尚未用真实手机/摄像头采集 12–20 张 ChArUco 图片并完成标定。
- 尚未进行实体标靶 0/2/5/10 mm 位移和现场重复性测试。
- 因此 V0.2 Demo Ready 只描述软件浏览器闭环，不等于野外毫米精度已验证。
