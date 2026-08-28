from __future__ import annotations

import base64
import json
import mimetypes
import socket
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import httpx
from pydantic import ValidationError

from app import config
from app.schemas.ai_review import AIFieldReview


DEFAULT_CHECKLIST = [
    "新裂缝或既有裂缝延伸",
    "墙体或挡墙可见渗水或水迹",
    "表面剥落或掉块",
    "明显凹凸或错落变化",
    "复测标志破损或遮挡",
    "图像覆盖是否足够完成本次目视复核",
]


class StepFunReviewError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def ai_status() -> dict[str, Any]:
    return {
        "enabled": config.STEPFUN_AI_REVIEW_ENABLED,
        "provider": "stepfun",
        "model": config.STEPFUN_MODEL,
        "configured": bool(config.STEPFUN_API_KEY),
    }


def extract_first_json_object(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("模型响应中没有可解析的 JSON object。")


def parse_review_response(text: str) -> AIFieldReview:
    return AIFieldReview.model_validate(extract_first_json_object(text))


def _data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _system_prompt() -> str:
    path = Path(__file__).resolve().parents[1] / "prompts" / "field_review_system.txt"
    return path.read_text(encoding="utf-8")


def build_messages(
    context_path: Path,
    previous_path: Path,
    current_path: Path,
    measurement: dict[str, Any],
    checklist: list[str] | None = None,
    *,
    retry_instruction: str | None = None,
) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for label, path in (
        ("图1：本次现场全景", context_path),
        ("图2：上次裂缝近景", previous_path),
        ("图3：本次裂缝近景", current_path),
    ):
        content.append({"type": "text", "text": label})
        content.append(
            {"type": "image_url", "image_url": {"url": _data_url(path), "detail": "high"}}
        )
    request_context = {
        "crack_id": measurement.get("crack_id", "CRACK-W01"),
        "measurement": {
            "opening_delta_mm": measurement.get("opening_delta_mm"),
            "measurement_source": "deterministic_geometry",
            "measurement_status": measurement.get("measurement_status", "accepted"),
        },
        "checklist": checklist or DEFAULT_CHECKLIST,
    }
    instruction = (
        "比较三张图中的可见变化。不得估算或修改毫米值。"
        "record_draft 只是待人工确认的草稿，不得写风险等级。"
        f"\n输入上下文：{json.dumps(request_context, ensure_ascii=False)}"
        f"\n输出 JSON schema：{json.dumps(AIFieldReview.model_json_schema(), ensure_ascii=False)}"
    )
    if retry_instruction:
        instruction += f"\n上一次输出无效：{retry_instruction}。请只重发合法 JSON object。"
    content.append({"type": "text", "text": instruction})
    return [
        {"role": "system", "content": _system_prompt()},
        {"role": "user", "content": content},
    ]


@contextmanager
def _temporary_dns_override(hostname: str, address: str | None) -> Iterator[None]:
    if not address:
        yield
        return
    original = socket.getaddrinfo

    def resolved(host: str, port: int, *args, **kwargs):  # type: ignore[no-untyped-def]
        return original(address if host == hostname else host, port, *args, **kwargs)

    socket.getaddrinfo = resolved  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.getaddrinfo = original  # type: ignore[assignment]


def _error_from_response(response: httpx.Response) -> StepFunReviewError:
    if response.status_code == 402:
        return StepFunReviewError(
            "quota",
            "StepFun 当前 API 通道额度不可用，请核对 Step Plan/Open API 端点与对应额度。",
        )
    if response.status_code == 429:
        return StepFunReviewError(
            "rate_limit",
            "StepFun 请求达到速率限制，请稍后重试。",
        )
    if response.status_code == 404:
        return StepFunReviewError("model_unavailable", "StepFun 模型暂不可用。")
    return StepFunReviewError("provider_error", f"StepFun 请求失败（HTTP {response.status_code}）。")


def run_field_review(
    context_path: Path,
    previous_path: Path,
    current_path: Path,
    measurement: dict[str, Any],
    checklist: list[str] | None = None,
) -> tuple[AIFieldReview, int, int]:
    status = ai_status()
    if not status["enabled"] or not status["configured"]:
        raise StepFunReviewError("unconfigured", "StepFun AI 现场复核未启用或未配置。")
    for path in (context_path, previous_path, current_path):
        if not path.exists():
            raise StepFunReviewError("missing_image", f"复核图片不存在：{path.name}")

    retry_instruction: str | None = None
    started = time.perf_counter()
    for attempt in range(1, 3):
        payload = {
            "model": config.STEPFUN_MODEL,
            "temperature": 0,
            "messages": build_messages(
                context_path,
                previous_path,
                current_path,
                measurement,
                checklist,
                retry_instruction=retry_instruction,
            ),
        }
        try:
            with _temporary_dns_override("api.stepfun.com", config.STEPFUN_RESOLVE_IP):
                with httpx.Client(timeout=config.STEPFUN_TIMEOUT_SECONDS) as client:
                    response = client.post(
                        f"{config.STEPFUN_BASE_URL}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {config.STEPFUN_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
        except httpx.TimeoutException as error:
            raise StepFunReviewError("timeout", "StepFun 请求超时。") from error
        except httpx.HTTPError as error:
            raise StepFunReviewError("network", "StepFun 网络请求失败。") from error
        if not response.is_success:
            raise _error_from_response(response)
        try:
            raw = response.json()["choices"][0]["message"]["content"]
            parsed = parse_review_response(raw)
            latency_ms = round((time.perf_counter() - started) * 1000)
            return parsed, latency_ms, attempt
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            retry_instruction = str(error)[:300]
    raise StepFunReviewError("invalid_response", "StepFun 连续两次返回了无效 JSON。")
