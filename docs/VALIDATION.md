# 验证记录

验证日期：2026-08-28。环境：Windows，本项目指定 `PulseWeave` Python 3.11.4，OpenCV contrib 4.14.0，Node.js 22.17.0。

## 合成几何基准

命令：

```bat
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe scripts\generate_benchmark.py
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe scripts\run_validation.py
```

覆盖：0/1/2/5/10 mm，yaw 0/10/20/30°，组合 pitch、亮暗、模糊、小遮挡、两 marker 遮挡和 42° 大角度。

结果：

| 指标 | 当前结果 |
|---|---:|
| 总案例 | 26 |
| 接受 / 拒绝 | 23 / 3 |
| 门控符合预期 | 26 / 26 |
| MAE | 0.305 mm |
| 中位误差 | 0.279 mm |
| p95 误差 | 0.894 mm |
| 最大误差 | 1.003 mm |
| 中位处理时间 | 44.04 ms |
| p95 处理时间 | 220.94 ms |

最大误差来自小遮挡案例。完整逐案例结果保存在 `artifacts/validation/results.csv`，未删除失败或较差案例。

## 自动测试与构建

- Python：5 tests passed；
- FastAPI：健康检查、图片测量、人工确认、历史查询、基准计时写入与汇总已覆盖；
- React/TypeScript/Vite：生产构建通过。

FastAPI 测试出现一条上游 `StarletteDeprecationWarning`（TestClient 未来迁移到 httpx2），不影响当前功能。

## 数据集状态

- CrackForest 已从 GitHub commit `ed57c2d96754e6c7d105805cd29aeeb3a799f267` 拉取；26 个案例使用其 `image` 目录作为纹理背景。该数据集是道路裂缝数据，不代表贵州地灾现场；

## 尚未验证

- 未进行真实打印尺寸核验；
- 未采集真实 webcam/手机 ChArUco 标定图；
- 未进行 2–10 mm 物理位移、不同距离/角度和 10 次连续现场 Demo；
- 未由真实基层监测员完成 shadow mode。

因此当前结论只能是：软件和受控合成链路可运行。不能声称野外 MAE ≤ 1 mm、marker 实拍识别 100% 或真实效率提升。
