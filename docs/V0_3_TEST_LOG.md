# V0.3 Test Log

日期：2026-08-28  
Python：通过 `GEORECHECK_PYTHON` 指定的隔离 Python 3.11 环境

## 数据与仿真

- 官方 Özgenel 归档下载完成：745,914,150 bytes，SHA-256 校验通过。
- 发现并评分 458 组 `rgb/BW` 图像；输出 20 张候选接触表，最终 manifest 记录 3 个场景。
- Golden Path：`data/datasets/ozgenel/rgb/328.jpg`。
- 生成 baseline、2 mm、5 mm yaw20、5 mm yaw30、模糊拒绝、遮挡拒绝场景及 metadata。

## 算法 A/B

输出：`artifacts/validation_v03/`

| 方法 | 可接受场景 | Failure rate | MAE | Median | P95 | Variance |
|---|---:|---:|---:|---:|---:|---:|
| planar_rectified_2d | 58/58 | 0% | 0.496 mm | 0.474 mm | 1.002 mm | 0.077 mm² |
| dual_pnp_3d | 58/58 | 0% | 0.680 mm | 0.366 mm | 2.282 mm | 0.618 mm² |

- 66 个场景的质量门控预期一致：66/66。
- 模糊、两枚右侧标签遮挡、过大组合视角均被拒绝。
- Golden Path 选择 `planar_rectified_2d`，原因是 MAE、P95 与误差方差更低。
- 上述数字只证明受控墙面仿真性能，不是现场精度结论。

## 自动化回归

- `python -m pytest -q`：5 passed，1 个 Starlette/httpx2 上游弃用警告。
- `npm run build`：TypeScript 与 Vite 生产构建通过，51 modules transformed。
- `npm run e2e`：7 passed / 50.4 s。
- 连续 10 次 Golden Path：10/10 PASS；每次均完成测量、4–6 mm 结果检查、before/after 加载、人工确认、记录生成与 3 张证据图加载。

## 真实浏览器检查

- 首屏、上传、自动处理、结果、记录、刷新恢复、`/scenario`、`/technology` 均实际操作通过。
- Golden Path 浏览器实测：`较上次张开 +5.5 mm`，剪切变化 `+0.5 mm`。
- 关键图片均 `naturalWidth > 0`；浏览器没有 page error、console error 或 HTTP 4xx/5xx。
- 截图保存在 `artifacts/ui_v03/01_real_scene_home.png` 至 `07_technology.png`。

## 未执行

- Native AprilTag 3 对比属于 P2，本轮未运行；默认继续使用已验证的 OpenCV AprilTag 字典检测。
- CrackRefineNet / CrackScopeNet 属于 P3，本轮未接入；AI 不影响主链路。
- 没有真实相机标定后的现场墙体与人工真值验证。
