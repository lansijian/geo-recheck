# V0.3 算法与工程边界

## 用户测量语义

V0.3 不再把左右板中心绝对距离作为用户结果。主结果是右侧复测贴相对左侧固定复测贴、相较上一期人工确认记录的变化：

```text
opening_delta_mm = x_current - x_baseline
shear_delta_mm   = y_current - y_baseline
```

X 轴沿左右复测贴连线方向，近似裂缝法向。首次建档裂缝开度 8.0 mm 只是受控演示值，不来自公开图片的真实尺度。板中心绝对距离只保留为折叠技术诊断。

## 主方法：planar_rectified_2d

墙面、裂缝和两张复测贴近似共面。系统用左贴已知 100 × 60 mm 几何、相机内参和左贴姿态建立 `image → left sticker plane (mm)` 的 metric homography，再把右贴四个标记中心投影到同一平面。右贴中心由多个候选点的中位数估计，并记录 homography RMSE 与候选点离散度。

此方法直接输出张开和剪切，墙面正视化也使用同一个映射，不把 PnP 深度噪声混进用户语义。

## A/B 方法：dual_pnp_3d

V0.2 Dual PnP 未删除。左右贴分别求解：

```text
T_C_L
T_C_R
T_L_R = inverse(T_C_L) @ T_C_R
```

输出右贴原点在左贴坐标系中的 `delta_x / delta_y / delta_z`，而不是旧的 `norm(t_right - t_left)`。批量验证会分别报告 planar 与 PnP 的 MAE、median、P95、variance、failure rate 和处理时间。

## 检测器策略

统一接口为 `FiducialDetector.detect()`，当前稳定默认实现是 `OpenCVArucoDetector`，字典为 AprilTag 36h11。Native AprilTag 3 属于 P2 独立 benchmark；没有证据证明更好前不切换 Windows 主链路。

## 质量门控

以下情况拒绝确认：任一侧识别不足 3 个标记、图像模糊、标记过小、严重曝光异常、视角超过阈值、PnP 重投影不稳定、metric homography 或右贴候选点离散度异常。未确认和被拒绝结果都不能成为下一期 baseline。

## 可选 AI

`ENABLE_CRACK_AI=false`。AI 裂缝分割本轮不参与毫米测量、质量门控或风险判断；P0/P1 稳定前不接入主链路。

## 声明边界

- 真实岗位和动作来自贵州公开报道；
- 墙体图片来自 Özgenel CC BY 4.0 公开数据集；
- 毫米尺度和位移来自同一墙面平面内的受控仿真；
- 仿真结果不是贵州真实监测数据，也不是野外精度证明；
- 系统不预测滑坡、不输出风险等级、不触发撤离。
