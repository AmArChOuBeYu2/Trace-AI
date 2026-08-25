import random
import time
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import errors, types

from backend.app.config import settings

TRANSIENT_CODES = {408, 429, 500, 502, 503, 504}
AUTH_CODES = {401, 403}
CONFIG_CODES = {400, 404}


class GeminiRuntime:
    """Central Gemini availability, model discovery, retry and health state."""

    def __init__(self) -> None:
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        self.primary_model = settings.GEMINI_MODEL
        self.available_models: list[str] = []
        self.active_model: str | None = None
        self.last_checked: str | None = None
        self.error_code: str | None = None
        self.last_error: str | None = None
        self.status = "FAILED_CONFIGURATION" if not self.api_key else "CONFIGURED"

        if self.api_key:
            try:
                retry_options = types.HttpRetryOptions(
                    attempts=max(1, settings.GEMINI_MAX_RETRIES),
                    initial_delay=1.0,
                    max_delay=4.0,
                    http_status_codes=list(TRANSIENT_CODES),
                )
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(retry_options=retry_options),
                )
            except Exception as exc:
                self.status = "FAILED_CONFIGURATION"
                self.last_error = str(exc)[:500]

    @staticmethod
    def _model_id(model: Any) -> str:
        return (getattr(model, "name", "") or "").removeprefix("models/")

    @staticmethod
    def _classify(exc: Exception) -> tuple[str, int | None]:
        code = getattr(exc, "code", None)
        try:
            code = int(code) if code is not None else None
        except (TypeError, ValueError):
            code = None
        if code in TRANSIENT_CODES:
            return "TEMPORARILY_UNAVAILABLE", code
        if code in AUTH_CODES:
            return "FAILED_AUTH", code
        if code in CONFIG_CODES:
            return "FAILED_CONFIGURATION", code
        if isinstance(exc, errors.APIError):
            return "FAILED", code
        return "FAILED", code

    def discover_models(self) -> list[str]:
        if not self.client:
            self.available_models = []
            return []
        try:
            discovered = []
            for model in self.client.models.list():
                model_id = self._model_id(model)
                actions = getattr(model, "supported_actions", None) or []
                if model_id.startswith("gemini-") and "generateContent" in actions:
                    discovered.append(model_id)
            self.available_models = sorted(set(discovered))
            return self.available_models
        except Exception as exc:
            status, code = self._classify(exc)
            self.status = status
            self.error_code = str(code) if code is not None else None
            self.last_error = str(exc)[:500]
            self.last_checked = datetime.now(timezone.utc).isoformat()
            self.available_models = []
            return []

    def candidate_models(self) -> list[str]:
        available = self.discover_models()
        if not available:
            return []

        candidates = []
        if self.primary_model in available:
            candidates.append(self.primary_model)

        configured = [m.strip() for m in settings.GEMINI_FALLBACK_MODELS.split(",") if m.strip()]
        for model_id in configured:
            if model_id in available and model_id not in candidates:
                candidates.append(model_id)

        # Live-discovered models are the final safety net. No model is used
        # merely because it appears in a hardcoded list.
        for model_id in available:
            if model_id not in candidates:
                candidates.append(model_id)
        return candidates

    def _sleep(self, attempt: int) -> None:
        delay = min(4.0, 0.75 * (2 ** attempt)) + random.uniform(0.0, 0.35)
        time.sleep(delay)

    def generate_content(self, contents: Any, config: types.GenerateContentConfig | None = None) -> tuple[Any | None, str | None, dict[str, Any]]:
        if not self.client:
            self.status = "FAILED_CONFIGURATION"
            return None, None, self.health()

        candidates = self.candidate_models()
        if not candidates:
            if self.status not in {"TEMPORARILY_UNAVAILABLE", "FAILED_AUTH", "FAILED_CONFIGURATION"}:
                self.status = "FAILED_CONFIGURATION"
                self.error_code = "MODEL_LIST_EMPTY"
            return None, None, self.health()

        for model_id in candidates:
            for attempt in range(max(1, settings.GEMINI_MAX_RETRIES)):
                try:
                    response = self.client.models.generate_content(model=model_id, contents=contents, config=config)
                    if not getattr(response, "text", None):
                        raise RuntimeError("Gemini returned an empty response")
                    self.status = "CONNECTED"
                    self.active_model = model_id
                    self.error_code = None
                    self.last_error = None
                    self.last_checked = datetime.now(timezone.utc).isoformat()
                    return response, model_id, self.health()
                except Exception as exc:
                    status, code = self._classify(exc)
                    self.status = status
                    self.error_code = str(code) if code is not None else None
                    self.last_error = str(exc)[:500]
                    self.last_checked = datetime.now(timezone.utc).isoformat()

                    if status in {"FAILED_AUTH", "FAILED_CONFIGURATION"}:
                        return None, None, self.health()
                    if status == "TEMPORARILY_UNAVAILABLE" and attempt + 1 < max(1, settings.GEMINI_MAX_RETRIES):
                        self._sleep(attempt)
                        continue
                    break

        self.active_model = None
        return None, None, self.health()

    def check(self) -> dict[str, Any]:
        if not self.api_key:
            self.status = "FAILED_CONFIGURATION"
            self.last_checked = datetime.now(timezone.utc).isoformat()
            return self.health()

        config = types.GenerateContentConfig(
            temperature=0,
            max_output_tokens=8,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        response, model, health = self.generate_content("Return exactly OK.", config=config)
        if response is not None:
            self.status = "CONNECTED"
            self.active_model = model
        return health

    def health(self) -> dict[str, Any]:
        return {
            "provider": "gemini",
            "status": self.status,
            "model": self.active_model or self.primary_model,
            "primary_model": self.primary_model,
            "available_models": self.available_models,
            "last_checked": self.last_checked,
            "error_code": self.error_code,
        }


gemini_runtime = GeminiRuntime()
