# V0.4 Repository Audit

审计日期：2026-08-28
稳定基线：`main @ 08737cb` / `v0.3-hackathon-demo`
开发分支：`feature/v0.4-ai-field-demo`

## 结论

V0.3 已经完成稳定的视觉测量闭环，但当前比赛主链路仍是单一受控 fixture 驱动的几何算法 PoC。它尚未形成“现场全景 → 复测对象 → 几何测量 → 多模态目视补漏 → 人工确认 → 巡查记录”的产业体验。

V0.4 不推翻 V0.3。核心职责必须固定为：

> 几何算法负责“量”；阶跃多模态负责“看”；监测员负责“确认”。

AI 不是 Agent，不控制几何测量，不输出风险等级，不预测灾害，也不能把未经人工确认的观察直接写入正式记录。

## 1. 当前 Golden Path 只有一个 fixture

`frontend/src/pages/HomePage.tsx` 将主按钮固定指向：

```text
/capture?demo=1
```

`frontend/src/pages/CapturePage.tsx` 在 demo 模式中固定加载：

```text
/wall-assets/current_open_5mm_yaw20.png
```

同一页面的处理文案和标题还直接写入：

```text
CRACK-W01
```

因此 V0.3 的比赛链路实际是“一张 +5 mm、yaw 20° 的受控图片 + 一个固定裂缝编号”，不是可选择的现场场景库。

## 2. 已下载数据量不等于 Demo 场景丰富度

本地已有 Özgenel 数据集的 458 对 `rgb/BW` 图像，但 `data/demo_scene_source_manifest.json` 只记录：

```text
328.jpg
529.JPG
417.JPG
```

其中只有 `328.jpg` 被标记为 Golden Path。下载约 700 MB 的 archive 只能证明原始数据已取得，不能证明产品具备丰富的真实场景体验。

V0.4 的验收对象应改成至少 5 个完整 Demo Case、至少 12 张经筛选的开放场景素材，并且每个素材和每个受控变化都有 provenance。

## 3. 当前六类图片适合 regression，不足以表达现场工作

现有：

```text
baseline_front
current_open_2mm_front
current_open_5mm_yaw20
current_open_5mm_yaw30
current_blur_reject
current_occlusion_reject
```

这些图片有效验证了 AprilTag、metric rectification、relative deformation 和 quality gate，但基本都是裂缝近景。它们没有稳定表达：

- 完整房屋或建筑立面；
- 裂缝在现场中的位置；
- 墙面/挡墙观察区域；
- 排水、渗水或水迹观察区域；
- 几何算法无法覆盖的表面剥落等可见变化。

V0.4 必须保留这些图片作为几何 regression，同时新增 `data/demo_cases/` 作为产业体验内容。

## 4. 当前首页“真实”主要存在于文字

`HomePage.tsx` 已正确呈现冯邦华、每天巡查至少 3 次、丈量/比对/台账及“人防 + 技防”边界，但首屏右侧仍是抽象人物卡，没有完整建筑或现场图。

评委目前看不到“墙体在哪里、裂缝在哪里、现场还要观察什么”。V0.4 首页需要使用 CC BY 建筑/立面场景，并只设置三个克制 callout：裂缝复测点、墙面/挡墙观察区、排水/渗水观察区。

## 5. 当前后端是确定性 CV，没有阶跃接入

当前后端已经具备并应原样保留：

- OpenCV AprilTag；
- metric rectification；
- relative opening / shear；
- quality gate；
- evidence；
- human confirmation；
- SQLite persistence。

审计时：

- `requirements.txt` 已包含 `httpx`，无需增加 OpenAI SDK；
- `.env.example` 没有 StepFun 配置；
- `backend/app/services/` 只有 measurement/registry 服务；
- 没有 StepFun 请求、AI JSON schema、AI review API 或 AI review persistence；
- README 明确写着可选 AI 尚未接入主链路。

因此 V0.3 不能被描述为“几何 + 多模态 AI”产品。

## 6. V0.4 的严格数据分层

- **REAL:** 贵州公开报道中的监测员岗位、巡查频次和动作。
- **PUBLIC DATA:** 具有明确许可证的建筑、墙体和裂缝图片。
- **SYNTHETIC:** marker 布设、baseline、张开/剪切位移、水迹/剥落等受控变化、相机变换和 Demo 毫米结果。

禁止把公开建筑图或合成变化描述为真实贵州监测记录、真实事故或现场性能。

## 7. AI 的允许职责

StepFun 只比较“现场全景 + 上次近景 + 本次近景”中有视觉证据支持的变化，例如：

- 新裂缝或既有裂缝延伸；
- 墙体/挡墙可见渗水或水迹；
- 表面剥落或掉块；
- 明显墙面变化；
- 复测贴破损或遮挡；
- 图片覆盖是否足够。

它不得：

- 估算或修改毫米值；
- 判断安全、危险或风险等级；
- 预测滑坡、崩塌；
- 建议预警、撤离或应急行动；
- 猜测地质成因；
- 把光照、阴影或拍摄角度差异强行解释为现场变化。

任何 observation 都必须先进入 `pending`，由监测员接受、拒绝或编辑。正式记录只读取人工确认项。

## 8. 实施顺序与完成证据

在改前端前必须先证明：

1. 开放数据来源、许可证和下载路径可核验；
2. 至少 5 个 Demo Case 和 12 张 curated scene images 已生成；
3. 每个 case 都有 `context.jpg`、`previous_close.jpg`、`current_close.jpg`、`metadata.json`；
4. StepFun 使用三图输入完成真实 smoke test；
5. 模型输出可提取首个 JSON object 并通过 Pydantic；
6. timeout、quota、model unavailable、无密钥时不阻塞几何结果；
7. API key 仅存在于被 Git 忽略的本地环境文件；
8. 离线 fixture 覆盖 parser、schema、人工确认和正式记录生成。

上述证据稳定后，才进入首页、巡查页、AI 复核卡片和记录页重构。
