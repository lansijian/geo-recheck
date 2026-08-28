# V0.1 真实 UI 审计

审计时间：2026-08-28  
审计环境：Windows 11；`scripts\run_dev.cmd`；Chromium（agent-browser 0.27.0）；前端 `127.0.0.1:5173`；后端 `127.0.0.1:8000`。

本文件只记录浏览器实际打开、点击、上传、刷新和检查 Network 后得到的结果，不以 README、组件存在或 pytest 通过代替 UI 验收。

## 逐页结果

| 页面 | 实际操作结果 | 图片/API | 问题 | 根因 | 修复方案 | 状态 |
|---|---|---|---|---|---|---|
| `/` | 能打开，三个点位可见，`MP-03` 可进入复测 | `GET /api/points` 200 | 没有“一键演示”；另两个点位保留禁用按钮，比赛入口不聚焦 | 首页仅按点位列表渲染，未实现 Golden Path 入口 | 增加一键演示按钮；保留真实可用入口并明确另外两个点位未配置原因 | 已修复并由 Playwright 验证 |
| `/capture` | 能打开；浏览器实际选择仓库样本后预览图 `naturalWidth=1920`；点击测量后 `POST /api/measure` 200 | 上传和内置样本均可进入后端 | 上传入口弱；没有拖拽；没有文件名、尺寸、大小；合法性错误不明确；内置样本需再次点击测量；初始大区域像空白模块 | file input 被按钮样式包装，状态只有“图像已准备”；没有文件元数据状态和自动 Demo 模式 | 重做为摄像头/上传两个主入口，加入 drag & drop、预览元数据和前端校验；一键 Demo 自动调用测量 | 已修复并由 Playwright 验证 |
| `/result` | 直接打开显示“没有待确认结果”；测量后可显示结果；同一标签页刷新依赖 sessionStorage 暂时保留，但 URL 仍为 `/result` | 测量后仅加载上一期 composite 与本次 composite，两张均为 200、`naturalWidth=680` | URL 无 inspection id；新会话或 sessionStorage 丢失后结果不可恢复；不展示原图、检测叠加图；质量细节不完整；照片区域不是核心 | ResultPage 只读取 sessionStorage；路由没有 id；组件只渲染 `previous_evidence.rectified` 和 `evidence.rectified` | 改为 `/result/:inspectionId` 并 GET inspection；展示原图、overlay、rectified；加入点击放大和算法质量详情 | 已修复并验证刷新恢复、三图加载 |
| `/record/:id` | 基线记录和实际确认后的记录都能打开；实际记录 API 200 | 实际确认记录只显示 overlay（1920 px）和 composite rectified（680 px） | 原始照片、去畸变图未显示；基线记录只有一张 composite，视觉区域显得未完成；缺少明确空状态 | RecordPage 只渲染 overlay 和 rectified；基线本来没有完整证据 | accepted 记录展示原图、overlay、rectified；缺图显示明确 empty state；结果页确认后继续使用持久 id 路由 | 已修复并由 Playwright 验证 |
| `/benchmark` | 能打开；两个计时按钮存在；`GET /api/benchmark/summary` 200 | 当前数据库无 trial | Traditional、System 两张摘要卡片只有“尚无本机试验”，中间节省区只有“待试验”，视觉上形成三个空业务模块；传统流程只逐步点击，没有填写真实输入 | 空状态信息不足；传统计时模拟字段未实现 | 加入明确空状态和试验进度；传统流程加入点位、人工值、变化和照片等最小输入；允许反复完成至少 3 次 | 已修复并完成一次真实浏览器计时 |
| `/calibration` | 能打开；配置 API 200；PDF 入口和多文件 input 存在 | 当前是 demo profile | 上传前没有缩略图；没有 fx/fy/cx/cy、畸变参数和 RMSE 结果区；未上传时下半区缺少可操作解释 | CameraProfile 类型和页面只显示名称/分辨率；文件状态只显示数量 | 增加缩略图、明确 empty state、完整参数结果和合格/拒绝展示 | 已修复 UI；真实相机标定待物理照片 |

## P0 照片链路实测

### 内置样本

1. 打开 `/capture`；
2. 点击“加载内置 +5 mm / 20° 样本”；
3. 浏览器请求 `/demo-assets/014_delta_5_angle_20.png`，返回 200；
4. preview 图片实际加载，`naturalWidth=1920`；
5. 点击“拍摄并计算”；
6. `POST /api/measure` 返回 200；
7. 结果约为上一期 243.2 mm、本次 247.9 mm、变化 +4.7 mm；
8. 结果页只加载两张 rectified composite，没有展示本次原图和 overlay。

### 文件上传

1. 在 `/capture` 的 file input 真实选择 `data/benchmark/images/014_delta_5_angle_20.png`；
2. preview 实际显示，`naturalWidth=1920`；
3. 点击“拍摄并计算”；
4. Network 中出现新的 `POST /api/measure` 200；
5. 确认后自动进入 `/record/a7275976-076e-44ac-be51-a243442999e5`；
6. 记录页两张图片实际加载，尺寸分别为 1920 和 680。

结论：V0.1 的底层文件上传并非完全失效，但入口、反馈和证据展示不完整，用户无法确信上传文件真正进入测量；后端也没有按要求输出 filename、保存名、尺寸和 marker 日志。因此用户反馈“上传不可用”在产品体验层面成立。

## 四个核心断点

1. **照片为什么看不到或看不全**：后端已有 `/evidence` 静态挂载并返回 HTTP URL，但结果页只渲染 composite，记录页只渲染 overlay 和 composite；原图和 undistorted 虽生成却没有成为 UI 内容。
2. **上传为什么被认为不能用**：入口不突出、无拖拽、无文件信息、无尺寸/大小校验反馈，按钮文案为“上传测试照片”，且后端日志不能证明真实 filename。
3. **三个空白模块是什么**：Benchmark 的 Traditional 摘要、System 摘要、节省比例三个区域在零 trial 时只有弱提示，形成三个近似空壳；此外 `/result` 直达也是空结果页，Calibration 未上传时没有缩略图或参数 empty state。
4. **自动流程为什么断**：首页无一键入口；内置样本仍需“加载→测量”两步；结果只存 sessionStorage，路由没有 inspection id，无法形成可复制、可刷新、可直达的持久链路。

## 审计证据

原始 V0.1 截图位于 `artifacts/ui_audit/v01_*.png`。这些文件用于保留修复前状态；V0.2 最终验收截图使用用户指定的 `01_home.png` 至 `07_calibration.png` 命名。
