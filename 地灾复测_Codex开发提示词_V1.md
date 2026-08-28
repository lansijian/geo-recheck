# Codex 开发提示词：地灾复测｜基层地灾视觉复测与自动留痕系统

> **项目名：地灾复测**
>
> **副标题：基层地灾视觉复测与自动留痕系统**
>
> 一句话：**把基层地灾监测员“量一次、比一次、记一次”的重复动作，压缩成“拍一次、确认一次”。**

---

## 0. 你是谁、你要做什么

你是本项目的主开发工程师。请直接在 **Windows 本地环境**完成一个可运行的 Web Demo，并把稳定性、可解释性、可复现性放在第一优先级。

这不是一个“AI 聊天机器人”，也不是地质灾害预测平台。

目标用户是贵州山区的**基层地灾监测员 / 群测群防员**。现实工作中，他们仍会到地质灾害隐患点现场：

1. 找到固定监测位置；
2. 查看裂缝/滑坡体/挡墙等是否变化；
3. 用卷尺、拉线等简易工具测量；
4. 和上一期数据进行比较；
5. 拍照；
6. 将时间、监测点编号、位置、坐标、裂缝宽度/位移变化等写入台账或系统；
7. 异常时再上报。

本 Demo 只解决其中一个非常窄、但非常真实的动作：

> **对已布设的固定视觉标靶进行重复拍照，自动完成去畸变、透视/姿态修正、监测点识别、位置校验、毫米级相对位移计算、历史对比和巡查记录生成。**

**不要预测滑坡。不要自动下达撤离。不要替代专业自动监测设备。**

---

# 1. 真实业务证据：不要把场景改成你自己想象的场景

开发过程中必须理解下面的事实。

## 1.1 贵州真实监测员仍然使用卷尺和台账

### 案例 A：贵州桐梓，监测员徐再敏

公开报道记录：

- 她在地灾隐患点查看地面裂缝变化；
- 使用卷尺测量相关数据；
- 如实记录监测台账；
- 正常情况下每 3–5 天监测一次；
- 强降雨时一天可能监测 2–3 次。

来源：
- 人民网贵州频道，《桐梓：多举措筑牢地质灾害防治安全屏障》
- https://gz.people.com.cn/n2/2026/0618/c407299-41614324.html

### 案例 B：贵州毕节七星关，监测员付磊

公开报道记录：

- 付磊带着 **卷尺、笔记本、铜锣** 到地灾隐患点；
- 与同伴使用拉线观测法；
- 实际现场口述：“一号点 1470 厘米，数据跟昨天一样，无异常。”
- 同一个隐患点同时已经安装斜坡监测仪和雨量监测仪。

这说明：
**人工巡查不是因为贵州“没有数字化”，而是自动监测与人工巡查本来就是并行体系。**

来源：
- 天眼新闻转载，《毕节七星关：“人防+技防”织密地质灾害“防护网”》
- https://www.sohu.com/a/1021239790_121106687

## 1.2 贵州的技术路线本来就是“人防 + 技防”

贵州官方资料明确要求：

- 对风险隐患动态开展巡查；
- 落实“雨前排查、雨中巡查、雨后复查”；
- 对变形加剧的隐患提高巡查频率；
- 自动化监测设备无法替代对整个现场的人工观察。

来源：
- 贵州省自然资源厅《地灾防治方案》
- https://zrzy.guizhou.gov.cn/wzgb/zwgk/zdlyxxgk/dzkcgl/dzzhfz/202309/t20230921_82465222.html

贵州自然资源厅科普材料也明确提到：
当高陡斜坡/危岩后缘裂缝明显张开或出现新裂缝时，应横跨裂缝布置简易监测点，了解变形拉裂情况。

来源：
- https://zrzy.guizhou.gov.cn/wzgb/xwzx/xtyw1/202205/t20220513_74052587.html

---

# 2. 现有方案 / 传统方案 / 我们的方案：必须做清楚竞品关系

## 2.1 传统人工方案

典型流程：

```text
到现场
→ 确认监测点
→ 找固定参考点 / 拉线 / 裂缝
→ 卷尺或简易标尺测量
→ 人工读取数值
→ 找上一期记录
→ 人工计算变化
→ 拍照
→ 手填时间、编号、坐标、测量值、变化、备注
→ 保存/上报
```

优点：

- 便宜；
- 不需要供电；
- 基层人员可以执行；
- 人能同时观察裂缝、落石、渗水、树木倾斜等宏观现象。

缺点：

- 测量、查历史、算变化、记录是重复动作；
- 人工读数和人工录入存在一致性问题；
- 历史照片通常只是留档，不天然具备同视角对齐和毫米级变化量；
- 暴雨期间监测频次上升，重复工作被放大；
- 数据和影像证据容易分离。

## 2.2 自动化传感器

例如 GNSS、裂缝计、雨量计、倾角计等。

优点：

- 24h 连续；
- 可远程上传；
- 专业监测能力强。

缺点 / 与我们不同：

- 需要安装、供电/通信、运维；
- 只监测布设的位置和传感量；
- 不能取代基层监测员对整个现场的观察；
- 我们**不与它竞争**。

## 2.3 地灾 App / 数据管理系统

现有地灾系统已经能够做：

- 点位档案；
- 巡查任务；
- 照片上传；
- 历史记录；
- 上报；
- 自动化设备数据管理。

因此禁止做一个“新的地灾管理平台”。

**我们的产品必须插在“现实世界 → 数字测量值”这一层。**

```text
传统：
现实现场
→ 人工测量
→ 人工比较
→ 人工记录
→ 现有系统

地灾复测：
现实现场
→ 拍照
→ 自动几何测量
→ 自动历史比较
→ 自动生成记录
→ 人工确认
→ 现有系统
```

---

# 3. 真实报表/监测记录字段：Demo 必须按照真实业务字段设计

公开地质灾害监测记录表常见字段包括：

- 监测时间
- 监测点编号
- 监测点坐标
- 监测内容
- 备注
- 记录人
- 裂隙发育程度
- 裂隙宽度
- 变化情况
- 是否有落石
- 变形破坏方式

公开监测数据库规范还包括：

- 监测点名称
- 地质灾害隐患点编码
- 监测点类型
- 监测方法
- 位置描述
- 经度
- 纬度
- 高程
- 监测预警员 / 群测群防员
- 运行状态
- 监测点二维码/唯一编号

因此本项目至少设计以下数据：

```text
hazard_id                 地质灾害隐患点编号
hazard_name               隐患点名称

monitor_point_id          监测点编号
monitor_point_name        监测点名称

structure_id              建筑/构筑物/观测对象编号（项目扩展字段）
structure_name            建筑/挡墙/边坡/裂缝观测对象名称

location_description      位置描述
latitude
longitude
elevation

left_marker_group
right_marker_group

capture_time
observer_name

previous_distance_mm
current_distance_mm
delta_opening_mm
delta_shear_mm            V0.1 可选

photo_original
photo_undistorted
photo_rectified
photo_overlay

quality_score
measurement_status
human_confirmed

visible_change_note       人工确认/可选 AI 辅助
remark
```

参考：
- 2026 年公开地质灾害监测记录表范例（监测时间、点位编号、坐标、裂隙宽度、变化情况等）
- https://www.ningchengxian.gov.cn/zwgk/zwdt/tzgg/202604/P020260413375659276224.pdf

---

# 4. 非常重要：监测点、位置、建筑/构筑物编号必须自动识别

不要要求工作人员拍完照片后再输入：

> “这是哪个点？”

## V0.1 方案

视觉标靶本身承担唯一 ID。

每个监测对象部署一组 marker board，例如：

```text
隐患点：GZ-TZ-001
监测点：MP-03
构筑物：WALL-02
左板：marker group 301
右板：marker group 302
```

检测到 301 + 302 后：

```text
301 / 302
→ 查询本地 point_registry
→ 自动得到：
   GZ-TZ-001
   MP-03
   WALL-02
   “岗上组坟岗不稳定斜坡 / 2号挡墙”
```

## 位置自动校验

网页端使用：

```js
navigator.geolocation
```

获取浏览器位置。

实际手机 PoC：

- marker ID 是**主身份**；
- GPS 是**二次校验**。

如果：

```text
检测到 MP-03
但设备位置距离登记点 > 100m
```

提示：

> “当前位置与登记监测点不一致，请确认是否拍错点位。”

不要因为 Windows 电脑没有精确 GPS 导致 Demo 无法运行。

Windows Demo 必须支持：

1. `DEMO_LOCATION_MODE=true`
2. 使用 seed data 中登记的贵州模拟坐标；
3. UI 明确显示“演示位置数据”。

如果浏览器支持真实定位，再显示“浏览器位置校验通过”。

## 上传照片时

如果照片有 EXIF GPS：

- 尝试读取；
- 没有 EXIF 不报错。

优先级：

```text
Marker ID > 浏览器 GPS / EXIF GPS > 人工选择（仅故障回退）
```

---

# 5. 核心算法：稳定第一，不要为了“AI”训练不必要的模型

## 5.1 推荐技术路线

V0.1 核心测量必须使用确定性的计算机视觉几何方法：

```text
原图
↓
相机去畸变
↓
视觉标靶检测
↓
亚像素角点优化
↓
Marker Board 身份识别
↓
监测点 / 构筑物自动匹配
↓
平面透视/姿态估计
↓
图像 Rectification
↓
左右标靶相对位置计算
↓
与 baseline / 上一期比较
↓
质量门控
↓
结果 + 证据图
```

## 5.2 Windows 上优先使用 OpenCV 自带方案

Python：

```text
opencv-contrib-python
numpy
scipy
fastapi
uvicorn
pydantic
sqlalchemy
pillow
exifread
```

优先使用：

```python
cv2.aruco
```

Dictionary 优先：

```python
cv2.aruco.DICT_APRILTAG_36h11
```

理由：

- AprilTag 对视觉定位和工程测量有大量验证；
- OpenCV 可以直接检测 AprilTag dictionary；
- Windows 不必额外编译 AprilTag C library；
- cv2.aruco 同时提供 marker、board、camera calibration 等能力。

AprilTag 参考实现：
- https://github.com/AprilRobotics/apriltag

OpenCV ArUco / AprilTag：
- https://docs.opencv.org/5.x/d5/dae/tutorial_aruco_detection.html

---

# 6. 自动“透射/透视修正”必须实现，不允许只在正视照片上跑

用户会从不同角度拍。

因此必须实现：

## Stage A：一次性相机标定

提供 `/calibration` 工具。

推荐 **ChArUco board** 标定：

```text
fx, fy, cx, cy
distortion coefficients
```

保存：

```text
data/camera_profiles/default_camera.json
```

如果没有完成标定：

Demo 可以使用预设 webcam profile，但 UI 要明确：

> “演示相机配置”

## Stage B：镜头畸变修正

```python
cv2.undistort()
```

或：

```python
cv2.initUndistortRectifyMap()
cv2.remap()
```

## Stage C：视觉标靶角点检测

不要直接使用整数像素角点。

检测后使用：

```python
cv2.cornerSubPix()
```

做亚像素角点优化。

## Stage D：透视/姿态修正

两个用途必须区分：

### 1. UI 对比图的“正视化”

使用：

```python
cv2.findHomography(..., cv2.RANSAC)
cv2.warpPerspective()
```

把当前照片 warp 到一个固定 canonical view。

这用于：

- 昨日 / 今日对比；
- 用户肉眼理解；
- 可选图像变化检测。

OpenCV Homography 官方资料：
- https://docs.opencv.org/master/d9/dab/tutorial_homography.html

### 2. 毫米测量

不要只靠 rectified image 的像素比例硬算。

优先通过**多 marker board + 相机标定 + PnP / photogrammetry**做几何测量。

建议左右各使用一个小型 marker board，而不是单独一个 marker：

```text
LEFT BOARD:  4 markers
RIGHT BOARD: 4 markers
```

这样：

- 部分 marker 遮挡时仍可测量；
- 多角点比单 marker 稳定；
- 可使用全部对应点求姿态。

优先尝试：

```python
cv2.solvePnP(...)
```

对于共面标靶，可测试：

```python
cv2.SOLVEPNP_IPPE
```

并与：

```python
cv2.SOLVEPNP_ITERATIVE
```

进行稳定性对比。

最终选择**实测误差更低**的方案，不要教条。

---

# 7. 推荐更稳定的物理标靶：双侧“视觉裂缝尺”

不要把算法核心放在“AI 找裂缝边缘”。

真实山地环境有：

- 泥土；
- 植被；
- 阴影；
- 雨水；
- 低光；
- 非规则裂缝；
- 相机角度变化。

因此 V0.1 做：

```text
[左视觉板]     裂缝/位移      [右视觉板]
```

两块薄板分别固定在裂缝两侧稳定介质上。

视觉板包含：

- 2×2 AprilTag / ArUco marker cluster；
- 人眼可读的监测点编号；
- 尺度基准；
- 左/右方向标记。

该思路并非凭空假设。

已有摄影测量研究使用：

- 两块固定在裂缝两侧的塑料标记板；
- ArUco 标记；
- 普通数字相机；
- 对倾斜/旋转照片进行空间解算和影像 rectification；
- 多期照片计算裂缝发展。

参考：
- Wojnarowski et al., *A Simple Device for Monitoring Cracks from Photographs*, ISPRS Archives, 2022
- https://isprs-archives.copernicus.org/articles/XLVI-5-W1-2022/245/2022/isprs-archives-XLVI-5-W1-2022-245-2022.html

研究报告其方法在特定实验条件下可获得很高精度。
**不要把论文中的最佳精度直接宣称成我们现场精度。**

我们 Demo 要自己测。

---

# 8. 算法结果：测“相对位移”，不是让 AI 猜裂缝宽度

V0.1 核心变量：

```text
D_t = 左右两个视觉锚点在第 t 次观测中的几何距离
```

历史：

```text
D_prev
```

当前：

```text
D_current
```

变化：

```text
delta = D_current - D_prev
```

如果二维面内分解可靠，可输出：

```text
opening_delta_mm
shear_delta_mm
```

否则 V0.1 只输出：

```text
relative_displacement_mm
```

不要输出假的 3D 精度。

---

# 9. 质量门控：这是 Demo 能不能像工程产品的关键

出现任何以下情况，**拒绝输出毫米值**：

## 9.1 Marker 不完整

例如左右板任一边可用 marker / corner 数不足。

提示：

> 无法可靠测量：右侧标靶识别不足。

## 9.2 图像模糊

使用 Laplacian variance 或更稳健的清晰度指标。

提示：

> 图像清晰度不足，请重新拍摄。

## 9.3 拍摄角度过大

从 pose / homography condition number 判断。

提示：

> 拍摄角度过大，请尽量正对监测标靶。

## 9.4 标靶过小

marker 在图像中的边长像素低于阈值。

提示：

> 拍摄距离过远。

## 9.5 光照 / 过曝

简单 histogram + clipping ratio 检查。

## 9.6 结果突变

例如历史为 245 mm，本次突然为 410 mm。

不要写：

> “裂缝扩大 165mm”。

写：

> “测量结果与历史差异异常，请重新拍摄或使用卷尺复核。”

## 9.7 GPS 不一致

只警告，不自动判定无效。

---

# 10. “AI”应该放在哪里

不要为了比赛硬塞大模型。

## 核心层：确定性 CV

必须稳定：

- Marker detection
- Camera calibration
- Distortion correction
- Homography
- Pose estimation
- Metric displacement
- Time-series comparison

## 可选 AI 辅助层

如果主链路已经 100% 稳定，再加：

```text
昨日照片 + 今日照片
→ crack / seepage / spalling change helper
```

输出只能是：

> 疑似新增裂缝  
> 疑似新增渗水  
> 疑似表面掉块

必须带：

> “请人工确认”

V0.1 不允许 AI 结果参与撤离/安全等级判断。

---

# 11. 真实数据集：Codex 必须自动下载，但不要拿数据集绑架开发进度

## Primary：CrackForest Dataset

用途：

- 使用真实裂缝纹理做 Demo 图片；
- 测试图像前处理；
- 可选变化检测；
- 生成真实背景的 synthetic benchmark。

公开 GitHub：

```text
https://github.com/cuilimeng/CrackForest-dataset
```

要求 Codex 建立：

```text
scripts/download_datasets.ps1
```

自动：

```powershell
git clone https://github.com/cuilimeng/CrackForest-dataset data/datasets/crackforest
```

注意它主要是道路裂缝，不等于贵州地灾裂缝。
**只能作为算法/视觉测试数据，不能宣称是贵州地灾训练集。**

## Optional：SDNET2018

约 500MB。

用途：

- 增加混凝土裂缝、墙体/结构表面变化测试。

来源：

```text
https://digitalcommons.usu.edu/all_datasets/48/
```

如果下载失败或过慢，不得阻塞主项目。

## Synthetic Ground Truth Benchmark

这是测量算法最重要的数据。

创建：

```text
scripts/generate_benchmark.py
```

基于真实裂缝背景图：

1. 叠加左右视觉板；
2. 设置 ground-truth baseline；
3. 人工产生：
   - +0 mm
   - +1 mm
   - +2 mm
   - +5 mm
   - +10 mm
4. 随机产生：
   - perspective transform；
   - rotation；
   - scale；
   - brightness；
   - blur；
   - small occlusion；
5. 保存 ground truth JSON。

目录：

```text
data/benchmark/
  images/
  ground_truth.json
```

这套数据用于 CI / regression test。

---

# 12. “传统方案 VS 我们方案”用时比较：不允许造数据

公开贵州报道可以证明工作流，但没有可靠的“单个点平均耗时 X 分钟”数据。

因此**禁止在代码/路演里预埋假的传统用时。**

有研究表明，特定表面裂缝自动图像测宽方法的测量时间至少比人工测量短 20 倍，但该研究不是贵州地灾现场，因此只能作为“方法有提效潜力”的旁证，不能直接当本项目 ROI。

参考：
- *Image-Based Automated Width Measurement of Surface Cracking*
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8617930/

## Demo 必须开发 A/B Benchmark 页面

路由：

```text
/benchmark
```

### Traditional Mode

界面模拟真实传统流程：

1. 开始计时；
2. 确认点位编号；
3. 读取“卷尺”数值（Demo 可由工作人员输入 ground truth）；
4. 打开上一期记录；
5. 计算变化；
6. 填写结果；
7. 上传/选择照片；
8. 提交记录；
9. 停止计时。

记录：

```text
trial_id
mode = traditional
duration_ms
errors
```

### System Mode

1. 开始计时；
2. 拍照/上传；
3. 自动识别；
4. 显示结果；
5. 人点击确认；
6. 停止计时。

记录：

```text
mode = system
duration_ms
```

### Benchmark Summary

至少支持 10 次试验：

```text
Traditional:
median
p90
min/max

System:
median
p90
min/max

time_saved_percent
```

现场路演前，我们自己跑 10 次形成真实 Demo baseline。

UI 必须写：

> “本页结果来自本机实际测试，不代表真实野外生产效率；PoC 阶段需由真实监测员重新测试。”

这是专业性加分项。

---

# 13. Windows 开发环境

目标：

```text
Windows 11
PowerShell
Python 3.11
Node.js 20 LTS
```

## Backend

```text
Python 3.11
FastAPI
OpenCV contrib
NumPy
SciPy
SQLAlchemy
SQLite
Pillow
EXIF reader
pytest
```

建立：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Frontend

```text
React
TypeScript
Vite
Tailwind CSS（仅用于布局和一致性）
```

不要引入复杂前端框架。

开发：

```powershell
npm install
npm run dev
```

后端：

```powershell
uvicorn app.main:app --reload --port 8000
```

---

# 14. Web Demo 架构

```text
browser
│
├─ Camera / Upload
├─ Geolocation
└─ UI
    │
    ▼
FastAPI
│
├─ CV Pipeline
│   ├─ undistort
│   ├─ marker detection
│   ├─ identity mapping
│   ├─ rectification
│   ├─ pose/displacement
│   └─ quality gate
│
├─ Inspection Service
│
├─ SQLite
│
└─ Evidence Images
```

---

# 15. Repository 结构

```text
geo-recheck/
│
├── README.md
├── requirements.txt
├── .env.example
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── cv/
│   │   │   ├── calibration.py
│   │   │   ├── marker_detector.py
│   │   │   ├── rectification.py
│   │   │   ├── pose_estimation.py
│   │   │   ├── displacement.py
│   │   │   └── quality_gate.py
│   │   ├── services/
│   │   ├── models/
│   │   └── db/
│   └── tests/
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   └── styles/
│
├── data/
│   ├── seed/
│   ├── images/
│   ├── benchmark/
│   ├── datasets/
│   └── camera_profiles/
│
├── scripts/
│   ├── setup_windows.ps1
│   ├── download_datasets.ps1
│   ├── generate_markers.py
│   ├── generate_benchmark.py
│   └── seed_demo.py
│
└── docs/
    ├── ALGORITHM.md
    ├── DEMO.md
    └── VALIDATION.md
```

---

# 16. API

只做必要 API。

```text
GET  /api/points
GET  /api/points/{id}

POST /api/measure
POST /api/inspections/{id}/confirm

GET  /api/points/{id}/history

POST /api/benchmark/trial
GET  /api/benchmark/summary
```

`POST /api/measure`

multipart：

```text
image
browser_lat?
browser_lon?
camera_profile?
```

系统自动从 marker group 找 point。

返回：

```json
{
  "hazard_id": "GZ-TZ-001",
  "monitor_point_id": "MP-03",
  "structure_id": "WALL-02",

  "location_description": "岗上组坟岗不稳定斜坡 / 2号挡墙",

  "previous_distance_mm": 243.2,
  "current_distance_mm": 247.7,
  "delta_mm": 4.5,

  "quality_score": 0.96,
  "status": "review_required",

  "location_match": true,

  "evidence": {
    "original": "...",
    "undistorted": "...",
    "rectified": "...",
    "overlay": "..."
  }
}
```

---

# 17. 页面：桌面 Demo 优先，但必须响应式

不要做营销首页。

打开网站直接进入：

## Page 1 `/`

### 今日复测

顶部：

```text
地灾复测
基层地灾视觉复测与自动留痕系统
```

卡片：

```text
坟岗不稳定斜坡
MP-03 · 2号挡墙
上次：2026-08-27 09:13
[开始复测]
```

另有两个 Demo 点位即可。

---

## Page 2 `/capture`

大面积摄像头 / 图片区域。

实时覆盖：

```text
监测点：自动识别中…
左标靶 ✓
右标靶 ✓
清晰度 ✓
角度 ✓
```

全部满足：

```text
[拍摄并计算]
```

支持：

```text
使用电脑摄像头
上传测试照片
```

---

## Page 3 `/result`

这是比赛最重要的页面。

左：

```text
上一次
```

右：

```text
本次
```

都显示已经透视校正后的 canonical view。

中间大数字：

```text
+4.5 mm
```

下面：

```text
上次：243.2 mm
本次：247.7 mm
```

身份：

```text
隐患点：GZ-TZ-001
监测点：MP-03
构筑物：WALL-02
位置：岗上组坟岗不稳定斜坡
```

位置校验：

```text
✓ 点位身份已由视觉标靶确认
✓ 位置校验通过
```

按钮只有：

```text
[确认本次结果]
[重新拍摄]
```

---

## Page 4 `/record/{id}`

自动形成标准化记录：

```text
监测时间
隐患点编号
监测点编号
构筑物编号
经纬度
上一期数值
本期数值
变化量
照片
图像质量
人工确认
记录人
备注
```

支持：

```text
打印
导出 HTML / PDF（时间允许再做）
```

---

## Page 5 `/benchmark`

传统 VS 系统真实计时对比。

---

# 18. UI / UX：严禁“AI 产品审美”

这是硬要求。

## 禁止

- 黑色/深色主背景；
- 蓝紫渐变；
- neon glow；
- 网格宇宙背景；
- 大面积玻璃拟态；
- “AI Assistant”聊天框；
- 机器人图标；
- 魔法棒图标；
- 大模型思考动画；
- 夸张圆角卡片堆叠；
- Landing page 大标题营销文案。

## 风格

定位：

> **专业工程巡检工具 + 轻量政企系统**

颜色建议：

```text
背景：#F6F7F5 / 白色
正文：#202522
弱文本：#68706B
主色：低饱和深绿 / 墨绿，例如 #2F5D50
边框：#DDE1DD
安全/正常：克制的绿色
警告：琥珀
异常：红色
```

不要渐变。

字体：

```text
Segoe UI
Microsoft YaHei
system-ui
```

桌面布局清爽、信息密度适中。

移动端也必须能用，但**比赛演示以电脑浏览器为主**。

---

# 19. Demo Seed Data

用真实报道场景做**业务故事原型**，但坐标数据如果公开来源不够精确，必须标注为 demo simulated coordinate。

Seed：

```json
{
  "hazard_id": "GZ-TZ-DEMO-001",
  "hazard_name": "坟岗不稳定斜坡（演示）",
  "monitor_point_id": "MP-03",
  "monitor_point_name": "裂缝简易监测点 03",
  "structure_id": "WALL-02",
  "structure_name": "2号挡墙 / 裂缝观测对象",
  "location_description": "贵州省遵义市桐梓县 · Demo",
  "latitude": 28.0,
  "longitude": 106.8,
  "baseline_mm": 243.2,
  "is_demo_location": true
}
```

**不要伪造精确真实坐标。**

---

# 20. 必须生成可打印标靶

`scripts/generate_markers.py`

输出：

```text
artifacts/markers/GZ-TZ-DEMO-001_MP-03_LEFT.pdf
artifacts/markers/GZ-TZ-DEMO-001_MP-03_RIGHT.pdf
```

每张板：

- A4 / A5 可打印；
- 2×2 marker cluster；
- 人眼可读：
  - 地灾复测
  - MP-03
  - LEFT / RIGHT
- 物理尺寸标注；
- 打印后可用普通尺校验尺寸。

如果 PDF 实现麻烦，先生成 300 DPI PNG。

---

# 21. 算法验证

必须提供：

```powershell
python scripts/generate_benchmark.py
pytest
```

至少测试：

## displacement

```text
0 mm
1 mm
2 mm
5 mm
10 mm
```

## camera transformations

```text
yaw/pitch ±10°
±20°
±30°
scale
translation
```

## image

```text
brightness
blur
noise
partial occlusion
```

输出：

```text
artifacts/validation/results.csv
artifacts/validation/summary.json
```

字段：

```text
ground_truth_mm
estimated_mm
absolute_error_mm
angle
blur
quality_gate
```

并自动计算：

```text
MAE
median error
p95 error
rejection rate
```

不要为了“看起来准确”删除失败 case。

---

# 22. Demo 环境验收目标

在我们自己打印的标靶 + Windows Webcam / 上传照片条件下：

V0.1 目标：

```text
2–10 mm 人工位移：
能够稳定判断方向和变化

目标 MAE：
争取 <= 1 mm（仅 Demo controlled environment）

单次后台处理：
< 2s 优先

Marker identification：
100% for demo test set

明显模糊/遮挡：
必须拒绝测量，而不是输出错误数字
```

**如果实测做不到 1mm，就在 UI / docs 写真实精度。不要造。**

---

# 23. 48 小时优先级

## P0：先完成

1. 项目脚手架
2. Dataset/script
3. Marker board
4. Camera calibration
5. Marker detection
6. Automatic point ID mapping
7. Undistortion
8. Perspective rectification
9. Displacement calculation
10. Quality gate
11. Previous/current comparison
12. Result page
13. Confirmation / SQLite record
14. Benchmark timer

## P1

15. Browser camera
16. Geolocation verification
17. Evidence overlay
18. Print record
19. Responsive mobile

## P2

20. Optional AI visible-change detection
21. PDF
22. More points
23. Dashboard

如果 P0 没稳定，禁止做 P2。

---

# 24. 非目标 / 禁止开发

不要做：

```text
Chatbot
RAG
LLM 问答
风险预测
滑坡概率
自动预警撤离
多租户
复杂权限
GIS 大地图
数字孪生
IoT 大屏
知识库
天气平台
复杂统计后台
```

这些都会把 48 小时 Demo 做烂。

---

# 25. 现场 Demo 剧本

准备一个可以左右移动的裂缝模型。

## 第一次

点击：

```text
开始复测
```

电脑摄像头/上传图识别：

```text
MP-03
WALL-02
```

得到：

```text
243.2 mm
```

## 人为移动 5mm

然后故意从另一个角度拍。

系统自动：

```text
镜头去畸变
→ marker detection
→ perspective correction
→ point match
→ comparison
```

结果：

```text
上次 243.2mm
本次 248.1mm
变化 +4.9mm
```

页面同时显示：

```text
昨日（已校正） | 今日（已校正）
```

最后：

```text
确认本次结果
```

自动生成：

```text
2026-08-28
MP-03
WALL-02
+4.9mm
location
photo evidence
observer
```

总时间控制在 1 分钟以内。

---

# 26. 一分钟产品讲解（开发者必须理解）

> 贵州已经有大量自动化地灾监测设备，但基层监测员仍然要去完成最后一公里巡查。公开报道里，桐梓的监测员会拿卷尺测裂缝、写台账；毕节的监测员甚至会现场喊“一号点1470厘米，跟昨天一样”。
>
> 所以我们没有再造一个地灾预测平台。
>
> 我们只把他们手里的卷尺变成一次拍照。
>
> 裂缝两边固定低成本视觉标靶。工作人员拍一张，系统自动识别这是哪个隐患点、哪个监测点、哪个构筑物，自动修正拍摄角度和镜头畸变，和上一期进行毫米级相对位移比较，并生成带照片、位置和编号的监测记录。
>
> 我们不替人判断山会不会塌。
>
> 我们只把“量一次、比一次、记一次”，变成“拍一次、确认一次”。

Codex 的每个产品决策都必须服务这句话。

---

# 27. 100 天 PoC 设计：代码结构要为它留接口

比赛后真实 PoC：

```text
1 个乡镇
3–5 个监测点
1–2 名真实监测员
```

Shadow Mode：

每次同时：

```text
卷尺 / 拉线 Ground Truth
+
地灾复测
```

比较：

```text
测量误差
重复性
拍摄失败率
单次操作耗时
记录完整率
用户是否愿意继续使用
```

未来接入：

```text
地灾智防 / 现有平台 API
```

但 Demo 不需要真的接现有系统。

设计一个：

```python
export_adapter
```

即可。

---

# 28. 开发执行方式

不要先写 1000 行代码。

严格按以下 milestone：

## M1：CV Proof

- 打印 marker
- Windows webcam / image upload
- 自动检测左右板
- 计算已知物理距离
- 写小测试
- 输出误差

**M1 不过，停止前端开发，先修算法。**

## M2：Perspective Robustness

- 故意换拍摄角度
- 自动 undistort
- homography / pose correction
- 误差测试

## M3：Point Identification

- marker IDs → point registry
- structure ID
- location verification

## M4：Workflow

- previous/current
- confirmation
- record

## M5：UI

- professional engineering interface

## M6：Benchmark

- traditional/system timing

## M7：Demo Freeze

- 10 次连续 Demo
- 不能 crash
- 删除不稳定功能

---

# 29. 最终交付

完成后必须提供：

```text
README.md
docs/ALGORITHM.md
docs/VALIDATION.md
docs/DEMO.md

scripts/setup_windows.ps1
scripts/download_datasets.ps1
scripts/generate_markers.py
scripts/generate_benchmark.py

frontend
backend

artifacts/validation/
artifacts/markers/
```

README 必须让新 Windows 电脑可以：

```powershell
git clone ...
.\scripts\setup_windows.ps1
.\scripts\download_datasets.ps1
.\scripts\run_dev.ps1
```

然后在浏览器打开 Demo。

---

# 30. 开始开发

现在直接开始，不要重新给我写项目规划文档。

第一步：

1. 创建 repo 结构；
2. 创建 Windows setup script；
3. 下载 CrackForest Dataset；
4. 生成第一组双侧 AprilTag Marker Board；
5. 做一个最小 Python CV 脚本；
6. 输入一张图片；
7. 输出 marker IDs、角点、pose、rectified image；
8. 建立 synthetic displacement benchmark；
9. 验证不同 perspective 下测量误差；
10. 只有测量链路稳定后再搭网页。

每完成一个 milestone：

- 跑测试；
- 报告真实结果；
- 如果失败，修复；
- 不允许用 hardcode 假装算法成功；
- 不允许为了 Demo 故意只适配一张测试图片。

**优先稳定。优先真实。优先 1 分钟可演示。**
