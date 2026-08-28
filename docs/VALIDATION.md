# 验证记录

验证日期：2026-08-28。环境：Windows；测试机通过 `GEORECHECK_PYTHON` 指定隔离的 Python 3.11 环境。

## V0.3 墙面受控基准

```bat
%GEORECHECK_PYTHON% scripts\run_validation_v03.py
```

测试覆盖 opening 0/1/2/5/10 mm、yaw 0/10/20/30°、pitch 0/10/20°，以及亮暗、模糊、小遮挡、两 marker 遮挡和过大视角。墙体纹理来自 Özgenel CC BY 4.0 数据；毫米尺度与位移均为受控仿真。

| 方法 | 成功 / 可接受 | Failure rate | MAE | Median | P95 | Variance |
|---|---:|---:|---:|---:|---:|---:|
| planar_rectified_2d | 58 / 58 | 0% | 0.496 mm | 0.474 mm | 1.002 mm | 0.077 mm² |
| dual_pnp_3d | 58 / 58 | 0% | 0.680 mm | 0.366 mm | 2.282 mm | 0.618 mm² |

质量门控符合预期 66/66。Golden Path 使用 `planar_rectified_2d`。逐案例结果、方法对比和机器可读摘要分别位于：

- `artifacts/validation_v03/results.csv`
- `artifacts/validation_v03/method_comparison.csv`
- `artifacts/validation_v03/summary.json`

旧的 CrackForest 验证文件仅作为 V0.2 legacy regression 保留，不再构成比赛 Golden Path 的数据或结论。

## 自动化和浏览器

- pytest：5 passed；
- TypeScript / Vite production build：PASS；
- Playwright：7 passed；
- 一分钟 Golden Path 连续 10 次：10/10 PASS；
- 浏览器人工链路：上传、处理、结果、确认、记录、刷新恢复、场景页和技术页 PASS；
- 控制台无 error，关键图片均成功加载。

完整测试记录见 `docs/V0_3_TEST_LOG.md`，浏览器截图见 `artifacts/ui_v03/`。

## 尚未验证

- 未进行真实打印尺寸与贴装尺寸核验；
- 未用真实相机完成 ChArUco 标定后的物理位移精度验证；
- 未完成 Native AprilTag 3 的 P2 benchmark；
- 未接入可选 AI 裂缝分割；
- 未由真实基层监测员完成 shadow mode。

因此当前结论仅限：软件、公开墙面纹理与受控几何仿真链路可重复运行。不能声称现场 MAE ≤ 1 mm、实拍识别 100% 或真实效率提升。

## 结论边界（真实点位泛化后重申）

- 本次迭代交付的是链路可用性（点位管理、复测贴分配、AI 现场复核可泛化到用户创建的真实监测点），不是现场精度；
- MAE 0.496 mm 与 P95 1.002 mm 仅在上文 V0.3 受控合成场景中成立，不可外推为真实拍摄条件下的精度；
- 打印缩放误差按比例转化为测量误差：复测贴打印缩放至 98% 会使毫米值系统性偏差约 2%，因此复测贴 PDF 上的 100 mm 校核边必须用卷尺实际测量确认，不能假定打印机按 100% 出图；
- 复测贴须贴附硬质衬底（如亚克力或硬纸板），左右两块复测贴须共面，否则单应/平面假设不成立，测量结果不可信；
- 覆盖多场景（不同光照、材质、角度组合）的受控精度基准推迟至 V0.6，本迭代未新增精度验证数据。
