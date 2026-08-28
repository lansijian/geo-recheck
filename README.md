# 地灾复测

基层地灾视觉复测与自动留痕系统。把固定视觉标靶的重复巡查从“量一次、比一次、记一次”压缩为“拍一次、确认一次”。

本项目不是地质灾害预测平台，不自动下达预警或撤离指令，也不替代现场人工巡查和专业自动监测设备。

当前版本：V0.2 Demo Ready（本地浏览器闭环）。该结论只表示一键 Demo、真实文件上传、证据图、持久结果、人工确认和记录页已经通过浏览器测试，不表示真实野外毫米精度已经验证。

## 当前状态

- 双侧 2×2 AprilTag（OpenCV `DICT_APRILTAG_36h11`）自动识别；
- Marker ID 自动匹配隐患点、监测点和构筑物；
- 去畸变、亚像素角点、IPPE/ITERATIVE PnP 择优、独立板位姿和相对位移；
- 模糊、标靶过小、角度过大、遮挡、曝光、重投影误差和历史突变门控；
- SQLite 历史、人工确认、证据图和可打印记录；
- 首页一键演示与真实照片上传双入口；
- `/result/:id` 可刷新结果页，以及原图、检测图、正视图三图证据；
- 传统/系统本机真实计时；
- ChArUco 相机标定工具；
- 26 个合成几何回归案例：MAE 0.305 mm、p95 0.894 mm、门控 26/26 符合预期。

上述精度只来自受控合成基准，不代表贵州野外或任意手机/相机的实测精度。真实相机必须先标定，再用已知位移和卷尺 ground truth 验证。

## Windows 运行

要求：Windows 11、Node.js 20+、Git。本项目所有 Python 命令固定使用：

```text
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe
```

你只需要使用 CMD。首次准备：

```bat
scripts\download_datasets.cmd
scripts\setup_windows.cmd
```

启动：

```bat
scripts\run_dev.cmd
```

打开 <http://127.0.0.1:5173>。在“拍摄复测照片”页点击“加载内置 +5 mm / 20° 样本”即可跑通不依赖摄像头的 Demo。

## 单独验证

```bat
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe scripts\generate_benchmark.py
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe scripts\run_validation.py
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe -m pytest
npm run build --prefix frontend
npm run e2e --prefix frontend
```

产物：

- 双侧标靶：`artifacts/markers/`
- ChArUco 标定板：`artifacts/calibration/`
- 验证结果：`artifacts/validation/results.csv`、`summary.json`
- 合成数据与真值：`data/benchmark/ground_truth.json`

CrackForest 仅用作道路裂缝纹理和视觉测试，不是贵州地灾训练集。CMD 下载脚本会在本机默认 DNS 失败时自动使用独立 DNS 解析，并只对该次 Git 命令注入解析结果；不会修改系统 DNS、hosts 或关闭 TLS 校验。

## 文档

- [算法与工程边界](docs/ALGORITHM.md)
- [验证结果](docs/VALIDATION.md)
- [V0.1 真实 UI 审计](docs/UI_AUDIT_V0_1.md)
- [V0.2 变更记录](docs/V0_2_CHANGELOG.md)
- [V0.2 最终测试记录](docs/V0_2_TEST_LOG.md)
- [一分钟演示流程](docs/DEMO.md)
