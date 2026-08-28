# GeoRecheck V0.6 + Fixed Crack MVP 融合审计

审计基线：`main`、`origin/main` 与 `origin/fixed-crack-recheck-mvp` 当前均指向 `1ffd438b636d78e92af3d94360dfbbc4f22e78c4`。队友分支已经通过历史中的普通 merge 保留完整提交，并在本次安全分支 `integration/fixed-crack-ecosystem` 上通过 `git merge --ff-only` 验证为 `Already up to date`。本文件记录后续生态级整合的唯一实施边界。

## 统一边界

- `/showcase` 是路演理解层；`/points` 是真实业务入口。两者复用同一 `Measurement`、`Inspection`、`AIReview`、人工确认与记录服务。
- 真实链路固定为：新建点位 → 分配 8 个 Marker → 下载复测贴 → 安装 → 建立基线 → 周期复测 → AI 可见变化复核 → 人工处置 → 正式记录。
- `MarkerAssignment.marker_id` 是 Marker 归属的唯一事实源；旧逗号字段只为兼容迁移，不参与匹配和计算。
- 主指标为“较基线累计张开”，次指标为“较上次张开”；内部板中心距离不得出现在业务界面或正式记录。
- `DEMO_*`、`MP-03`、`CRACK-W01`、`case_*`、301–308 只允许存在于演示、种子和测试夹具，不得成为真实点位的回退值。
- AI 仅给出可见变化，不能修改毫米结果、风险等级、安全结论或预警；只有人工采纳或编辑后的条目进入正式记录。

## 20 层代码审计

| 层 | main 原有实现 | 队友分支实现 | 重复/冲突 | 最终统一方案 |
|---|---|---|---|---|
| 1. Routes | `/showcase`、`/capture`、`/result/:id`、`/record/:id`、技术页 | `/points`、`/points/new`、`/points/:monitorPointId` 并复用 Capture/Result/Record | 路由共存但主导航并列、职责不清 | 保留全部路由；导航收敛为现场演示、监测点、开始复测，技术页进入次级入口 |
| 2. Navigation | AppShell 以“现场模拟/技术操作/真实场景/技术依据”为主 | 增加“裂缝管理” | “技术操作”硬连演示案例，真实业务入口弱 | `/showcase`、`/points`、`/capture` 为一级；技术与设置为折叠次级 |
| 3. API | 测量、AI、确认、记录、演示案例、校准、基准测试 | 点位 CRUD、复测贴、全景、基线、点位历史 | 同一 `/api/measure` 同时支持演示和真实，但隔离规则散落 | 保留统一 API；由显式 demo case 或 point context 判定模式，并拒绝跨模式回退 |
| 4. Schema | `Measurement`、`AIReview`、演示案例响应 | `PointCreatePayload`、baseline/recheck 字段、累计/环比字段 | `Point.baseline_mm` 与内部距离字段仍暴露给前端 | 类型保留兼容字段但界面禁用；新增明确 lifecycle 状态，累计为主、环比为次 |
| 5. Migration | V0.3–V0.5 增量加列，保留 inspections、AI reviews、benchmark | 重建 monitor_points 以允许空坐标；回填 marker_assignments | inspector 绑定全局 engine；FK 仅部分启用/声明，缺乏旧库验收 | 迁移函数可针对任意连接测试；SQLite 每连接启用 FK；补齐可安全迁移的约束与外键完整性验证 |
| 6. Models | MonitorPoint、Inspection、AIReview、AIReviewItem、BenchmarkTrial | MarkerAssignment、baseline/context 字段 | Inspection/AIReview/Item 缺少声明式 FK；Marker side/slot 缺组合约束 | 建立可迁移 FK/唯一约束，保持删除策略不破坏历史记录，`foreign_key_check` 必须为空 |
| 7. Marker | 演示板固定 301–308 | 全局 0–586 连续 8 枚自动分配，删除点位后可复用空洞 | 演示固定值可能污染真实匹配 | 真实点位只读 MarkerAssignment；301–308 仅种子 MP-03/演示数据使用 |
| 8. Baseline | 演示种子基线和单次测量 | baseline 状态机、禁止覆盖、无基线禁止复测 | `baseline_mm` 旧字段语义与新基线 inspection 并存 | baseline inspection 为唯一业务基线；旧字段只迁移兼容、禁止呈现 |
| 9. Demo/Real | Showcase 使用 `case_*`、MP-03、受控演示图与回放 | 用户点位通过 point 参数做真实测量 | 序列化和 provenance 仍可将 CRACK-W01/DEMO 值回退到真实点 | 所有回退按 `demo_case_id` 或 `is_demo_location` 严格门控；真实点位缺数据必须显式失败 |
| 10. AI | Showcase 三图 Hybrid Replay/可选实时 StepFun | 真实点位使用全景、上次已确认、本次图 | 真实测量的 crack id/provenance 可继承演示默认；AI item 多次请求时错误文案不够可诊断 | 按模式解析三图；item 决策绑定 inspection/review；保留毫米值不受 AI 结果影响 |
| 11. Record | 确认后生成正式记录；仅 accepted/edited 条目写入 | 基线记录、真实点位历史复用同一记录页 | 记录页将所有数据统一写成“公开场景复原/受控仿真” | 根据 provenance 显示真实采集或演示披露；拒绝项只留审计详情，不进正文 |
| 12. Sticker | 无 | 每点位双板 8 Marker 可打印 PDF | PDF 独立实现但数据源正确 | 保留 PDF 服务；板号只来自 MarkerAssignment，补解析和版式测试 |
| 13. Showcase | Three.js Field Inspector Simulator、手机流程、AI 回放、人工确认 | 合并后调用统一后端测量/AI/记录 | 演示硬编码合法，但术语和导航与真实点位不一致 | 保留 Three.js；统一“现场演示/监测点/建立基线/周期复测/人工确认”术语，不复制业务服务 |
| 14. Capture | 拖拽、点击、Demo Case、质量失败重拍 | point + baseline/recheck 参数、真实点位全景提醒 | 无 point 时默认 case_03，可能让普通 `/capture` 隐式进入演示 | 只有显式 `demo=1` 才加载案例；真实开始复测必须选定点位或从点位工作台进入 |
| 15. Result | 几何结果、AI 执行/回放、人工决策、确认 | 累计/环比、基线模式、真实点位 AI | AI 观察项 404 对用户只显示“不存在”，并可能由过期 item 操作触发 | 决策按钮操作期间锁定并用服务端最新 review 替换；错误提示包含刷新建议；模式术语统一 |
| 16. Record Page | 可打印正式记录、证据图、AI 人工处置 | 展示 baseline/累计/环比 | 数据性质与边界文案写死演示语义 | 从 measurement provenance 渲染；真实点位不显示演示披露 |
| 17. CSS | V0.6 米白、低饱和绿、工程化三栏、Showcase 专用样式 | Points/Form/Detail 的基础卡片样式 | 点位页字号、密度和操作层级不足，不适合路演投屏 | 复用 V0.6 token，提高正文/关键数字/按钮字号，点位详情重组为现场工作台 |
| 18. Backend tests | 几何、质量、AI、记录、演示案例 | 点位分配、基线状态、真实点 AI | 缺 marker 复用、旧库迁移、FK、拒绝记录不作 previous、严格隔离等完整矩阵 | 补足至少 19 项后端矩阵并使用临时 SQLite/临时证据目录隔离 |
| 19. Playwright | Showcase、golden path、repeatability、capture upload | 新建点位、PDF 链接、进入基线 | point lifecycle 只到基线采集入口；测试删除环境变量后未恢复 | 保存/恢复环境；新增真实点位基线、复测、AI/HITL/Record 及质量失败重拍流程 |
| 20. Delivery/Git | main 保有 V0.6 和历史标签 | 固定裂缝分支保留完整提交 | 当前两个远端分支已同 SHA，但没有独立融合验收提交 | 所有改动只在 integration 分支；18 类验证全 PASS 后 fast-forward main，同时推送并保留两个分支 |

## 实施顺序与验收门

1. 数据库与迁移：先保证 fresh DB、既有 V0.6 DB、数据保留和 FK 完整。
2. 后端业务层：Marker 唯一事实源、baseline/previous 语义、demo/real 隔离、AI 与正式记录边界。
3. API 与前端：统一真实生命周期、工作台、导航和投屏可读性。
4. 自动化：后端矩阵、TypeScript、生产构建、Playwright 五条业务流。
5. 浏览器复核：分别打开 `/showcase` 和 `/points`，观察控制台、网络、关键交互与证据写入。
6. Git：仅在全部验收通过后 fast-forward 回 `main`；不删除 `fixed-crack-recheck-mvp`。
