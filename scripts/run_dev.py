from __future__ import annotations

import subprocess
import sys
import time
import urllib.request
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def wait_for_url(process: subprocess.Popen, url: str, label: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"{label} exited before becoming ready.")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError(f"{label} readiness check timed out.")


def open_showcase_in_chrome() -> None:
    chrome_candidates = (
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    )
    chrome = next((path for path in chrome_candidates if path.is_file()), None)
    if chrome is None:
        print("Google Chrome was not found. Open http://127.0.0.1:5173/showcase manually.", flush=True)
        return
    subprocess.Popen([str(chrome), "--new-window", "http://127.0.0.1:5173/showcase"])
    print("Opened Showcase in Google Chrome (avoids Lenovo browser extension injection).", flush=True)


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> int:
    backend: subprocess.Popen | None = None
    frontend: subprocess.Popen | None = None
    try:
        backend = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--app-dir",
                "backend",
                "--host",
                "127.0.0.1",
                "--port",
                "8000",
            ],
            cwd=ROOT,
        )
        wait_for_url(backend, "http://127.0.0.1:8000/api/health", "Backend", 20.0)
        print("Backend ready: http://127.0.0.1:8000", flush=True)
        frontend = subprocess.Popen(["npm.cmd", "run", "dev"], cwd=ROOT / "frontend")
        wait_for_url(frontend, "http://127.0.0.1:5173/showcase", "Frontend", 30.0)
        print("Frontend ready: http://127.0.0.1:5173/showcase", flush=True)
        if os.environ.get("GEORECHECK_OPEN_BROWSER") == "1":
            open_showcase_in_chrome()
        return frontend.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        stop(frontend)
        stop(backend)


if __name__ == "__main__":
    raise SystemExit(main())
