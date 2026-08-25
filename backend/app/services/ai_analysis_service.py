import os
import json
from google.genai import types
from backend.app.services.gemini_runtime import gemini_runtime


class AIAnalysisService:
    def _generate(self, contents):
        config = types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        return gemini_runtime.generate_content(contents, config=config)

    @staticmethod
    def _parse_json(text: str) -> dict:
        text = text.strip()
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()
        return json.loads(text)

    def analyze_media(self, media_path: str, mime_type: str, ocr_text: str = None, metadata: dict = None, sampled_frames: list = None) -> dict:
        if not os.path.exists(media_path):
            return {"ai_status": "UNAVAILABLE", "reason": "Media file unavailable", "error_code": "MEDIA_NOT_FOUND", "model": None, "indicators": []}

        try:
            is_video = mime_type.startswith("video/")
            contents = []
            if is_video and sampled_frames:
                for frame_path in sampled_frames:
                    if os.path.exists(frame_path):
                        with open(frame_path, "rb") as f_img:
                            contents.append({"inline_data": {"mime_type": "image/jpeg", "data": f_img.read()}})
                if not contents:
                    with open(media_path, "rb") as f_orig:
                        contents.append({"inline_data": {"mime_type": mime_type, "data": f_orig.read()}})
            else:
                with open(media_path, "rb") as f_orig:
                    contents.append({"inline_data": {"mime_type": mime_type, "data": f_orig.read()}})

            if is_video:
                prompt = f"""
You are a digital video forensics investigator. Analyze the representative frames chronologically.
Known Metadata: {json.dumps(metadata) if metadata else 'None'}
Extracted OCR Text: {ocr_text if ocr_text else 'None'}
Evaluate only observable temporal inconsistencies, identity consistency, audio/visual mismatch indicators when evidence exists, and compositing/rendering signs. Do not speculate.
"""
            else:
                prompt = f"""
You are a digital image forensics investigator. Analyze this image.
Known Metadata: {json.dumps(metadata) if metadata else 'None'}
Extracted OCR Text: {ocr_text if ocr_text else 'None'}
Evaluate only observable manipulation indicators, lighting/shadow inconsistencies, anatomical inconsistencies, and text/context anomalies. Do not speculate.
"""

            prompt += """
Return strict JSON:
{
  "ai_generation_likelihood": float,
  "manipulation_likelihood": float,
  "confidence": "low" | "medium" | "high",
  "summary": "Evidence-backed forensic assessment.",
  "indicators": [{
    "category": "visual" | "metadata" | "audio" | "temporal",
    "finding": "Forensic indicator description",
    "severity": "info" | "low" | "medium" | "high" | "critical",
    "confidence": "low" | "medium" | "high" | "conclusive",
    "evidence_level": "OBSERVED" | "INFERRED" | "CONCLUSION",
    "details": "Technical evidence supporting the finding"
  }]
}
"""

            response, model, health = self._generate(contents + [prompt])
            if response is None:
                return {
                    "ai_status": "UNAVAILABLE",
                    "reason": "Gemini provider temporarily unavailable",
                    "error_code": health.get("error_code"),
                    "model": health.get("model"),
                    "indicators": [],
                }

            result = self._parse_json(response.text)
            result["ai_status"] = "AVAILABLE"
            result["model"] = model
            return result
        except Exception as exc:
            print(f"[AI] Gemini analysis failed: {exc}")
            return {
                "ai_status": "UNAVAILABLE",
                "reason": "Gemini provider temporarily unavailable",
                "error_code": None,
                "model": None,
                "indicators": [],
            }

    def generate_narrative_evolution(self, versions: list) -> dict:
        if len(versions) < 2:
            return {"ai_status": "AVAILABLE", "evolution_pattern": "Insufficient versions", "summary": "Requires at least 2 versions to determine shift.", "intensity_score": 0.0, "shifts": []}

        prompt = f"""
You are a forensic analyst. Compare these text captions/headlines in chronological order:
{json.dumps(versions, indent=2)}
Return strict JSON with evolution_pattern, summary, intensity_score, and shifts. Base conclusions only on the supplied text.
"""
        try:
            response, model, health = self._generate([prompt])
            if response is None:
                return {"ai_status": "UNAVAILABLE", "reason": "Gemini provider temporarily unavailable", "error_code": health.get("error_code"), "model": health.get("model"), "shifts": []}
            result = self._parse_json(response.text)
            result["ai_status"] = "AVAILABLE"
            result["model"] = model
            return result
        except Exception as exc:
            print(f"[AI] Narrative reasoning failed: {exc}")
            return {"ai_status": "UNAVAILABLE", "reason": "Gemini provider temporarily unavailable", "error_code": None, "model": None, "shifts": []}


ai_analysis_service = AIAnalysisService()
