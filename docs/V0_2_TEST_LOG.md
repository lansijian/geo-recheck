# V0.2 最终测试记录

执行日期：2026-08-28  
环境：Windows 11；Python 固定为 `D:\Anaconda\_envs\PulseWeave\Scripts\python.exe`。

## pytest

命令：

```bat
D:\Anaconda\_envs\PulseWeave\Scripts\python.exe -m pytest -q
```

实际结果：`5 passed, 1 warning in 2.42s`。

warning 是 FastAPI/Starlette TestClient 关于未来 `httpx2` 的上游弃用提示，不是当前测试失败。

## TypeScript + Vite production build

命令：

```bat
npm run build --prefix frontend
```

实际结果：

```text
49 modules transformed
dist/index.html                  0.45 kB | gzip 0.31 kB
dist/assets/index-DWK7C1GV.css 15.99 kB | gzip 4.05 kB
dist/assets/index-DgfD_MzK.js 263.35 kB | gzip 83.87 kB
built in 970ms
```

## Playwright Chromium

命令：

```bat
npm run e2e --prefix frontend
```

实际结果：`6 passed (40.5s)`。

包含：

1. 首页 MP-03、一键 Demo、无 console/page error；
2. 一键 Demo +4–6 mm、三张证据图 `naturalWidth > 0`；
3. 真实 file input 上传、preview、`POST /api/measure` 200；
4. 人工确认、记录页及三张证据图；
5. `/result/:id` 刷新后从 API 恢复；
6. 连续 10 次 Golden Path，每轮执行测量、三图加载、人工确认和记录页三图加载。

Playwright HTML 报告在本地生成到 `artifacts/playwright-report/index.html`，该运行产物不进入 Git。
