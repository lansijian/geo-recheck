# macOS 启动说明

本文说明如何在 macOS 上本地运行 GeoRecheck V0.3 Demo。当前项目的
`scripts/setup_windows.cmd` 和 `scripts/run_dev.cmd` 仅适用于 Windows；macOS
请按以下步骤在两个 Terminal 中分别启动后端和前端。

## 前置条件

- macOS 13 或更高版本；
- Python 3.11；
- Node.js 20 或更高版本；
- npm。

确认版本：

```bash
python3.11 --version
node --version
npm --version
```

如果没有 `python3.11`，请先使用你惯用的 Python 版本管理工具安装 Python 3.11。
项目中的 OpenCV 和受控验证均以 Python 3.11 为基线。

## 首次安装

在仓库根目录执行：

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
npm ci --prefix frontend
```

`.venv`、`frontend/node_modules`、运行时 SQLite 数据库和生成的证据图片均被
`.gitignore` 忽略，不会成为 Git 变更。

仓库已包含一分钟 Demo 所需的受控墙面样本，因此启动现有 Demo 不需要下载完整的
公开裂缝数据集。只有重新生成场景或运行数据脚本时，才需要按照 Windows 安装脚本中的
说明下载数据集。

## 启动 Demo

在第一个 Terminal 中启动 API：

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

看到 `Uvicorn running on http://127.0.0.1:8000` 后，在第二个 Terminal 中启动前端：

```bash
npm run dev --prefix frontend -- --host 127.0.0.1
```

浏览器打开 <http://127.0.0.1:5173>，点击“**一分钟演示：复测这条墙缝**”。

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

期望结果：

```json
{"status":"ok","service":"geo-recheck","version":"0.3.0"}
```

## 停止服务

在两个 Terminal 中分别按 `Control-C`。

## 本地验证

后端测试和前端生产构建可在仓库根目录运行：

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
```

当前 `npm run e2e --prefix frontend` 尚未支持 macOS：测试文件硬编码了 Windows 的
`.venv/Scripts/python.exe`，并且需要单独安装 Playwright Chromium。该限制不会影响
Demo 的手动启动和浏览器主流程；跨平台 E2E 支持应作为后续工程任务处理。

## Demo 数据边界

一分钟演示中的墙面纹理来自公开数据集，标靶位移和毫米结果来自受控合成场景。它用于
验证“识别 → 质量门控 → 相对复测 → 人工确认 → 留痕”的软件链路，不代表真实现场测量
精度，也不输出地灾风险判断或预警结论。
