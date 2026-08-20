import os
import httpx
from typing import Dict, Any, Optional
from backend.app.config import settings

class HuggingFaceService:
    def __init__(self):
        self.api_token = settings.HF_TOKEN
        self.image_model = "umm-maybe/AI-image-detector"
        self.text_model = "roberta-base-openai-detector"

    def is_configured(self) -> bool:
        return bool(self.api_token)

    async def detect_ai_image(self, image_path: str) -> Optional[Dict[str, Any]]:
        """
        Queries Hugging Face Inference API for image deepfake detection.
        Uses model: umm-maybe/AI-image-detector
        """
        if not self.is_configured():
            print("[HF] Token not configured. Hugging Face Image Analysis skipped.")
            return None

        if not os.path.exists(image_path):
            print(f"[HF] Image file path not found: {image_path}")
            return None

        url = f"https://router.huggingface.co/hf-inference/models/{self.image_model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}"
        }

        try:
            with open(image_path, "rb") as f:
                image_data = f.read()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers=headers,
                    content=image_data,
                    timeout=15.0
                )

                if response.status_code == 200:
                    data = response.json()
                    # Format typically: [{"label": "artificial", "score": 0.89}, {"label": "human", "score": 0.11}]
                    print(f"[HF] Image deepfake classifier returned: {data}")
                    return self._parse_classifier_response(data)
                
                # Check for model loading delay (Hugging Face sometimes returns 503 while loading a model)
                elif response.status_code == 503:
                    print("[HF] Model is currently loading on Hugging Face hub. Retrying in 5 seconds...")
                    import asyncio
                    await asyncio.sleep(5.0)
                    response = await client.post(url, headers=headers, content=image_data, timeout=15.0)
                    if response.status_code == 200:
                        return self._parse_classifier_response(response.json())
                
                print(f"[HF] API Error ({response.status_code}): {response.text}")
                return {"error": f"API Error ({response.status_code}): {response.text}", "status_code": response.status_code}

        except Exception as e:
            print(f"[HF] Image deepfake query failed: {e}")
            return None

    async def detect_ai_text(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Queries Hugging Face Inference API for text AI generation detection.
        Uses model: roberta-base-openai-detector
        """
        if not self.is_configured():
            print("[HF] Token not configured. Hugging Face Text Analysis skipped.")
            return None

        url = f"https://router.huggingface.co/hf-inference/models/{self.text_model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        payload = {"inputs": text}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=15.0
                )

                if response.status_code == 200:
                    data = response.json()
                    # Format: [[{"label": "Fake", "score": 0.99}, {"label": "Real", "score": 0.01}]]
                    print(f"[HF] Text deepfake classifier returned: {data}")
                    if isinstance(data, list) and len(data) > 0:
                        inner = data[0]
                        if isinstance(inner, list):
                            return self._parse_classifier_response(inner)
                    return None
                
                elif response.status_code == 503:
                    print("[HF] Text model is loading. Retrying in 5 seconds...")
                    import asyncio
                    await asyncio.sleep(5.0)
                    response = await client.post(url, headers=headers, json=payload, timeout=15.0)
                    if response.status_code == 200:
                        data = response.json()
                        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                            return self._parse_classifier_response(data[0])
                
                print(f"[HF] API Error ({response.status_code}): {response.text}")
                return {"error": f"API Error ({response.status_code}): {response.text}", "status_code": response.status_code}

        except Exception as e:
            print(f"[HF] Text deepfake query failed: {e}")
            return None

    def _parse_classifier_response(self, results: list) -> Dict[str, Any]:
        """
        Helper to map Hugging Face labels to a unified score payload.
        """
        ai_score = 0.0
        human_score = 0.0

        for item in results:
            label = item.get("label", "").lower()
            score = item.get("score", 0.0)

            # Map artificial / fake / generated labels
            if any(l in label for l in ["artificial", "fake", "generated", "label_1"]):
                ai_score = score
            elif any(l in label for l in ["human", "real", "label_0"]):
                human_score = score

        # If labels are not explicit, take the first one if it fits
        if ai_score == 0.0 and human_score == 0.0 and results:
            first = results[0]
            if "fake" in first.get("label", "").lower():
                ai_score = first.get("score", 0.0)
            else:
                human_score = first.get("score", 0.0)

        # Normalize outputs
        if ai_score == 0.0 and human_score > 0.0:
            ai_score = 1.0 - human_score

        return {
            "ai_likelihood": round(ai_score, 4),
            "confidence": "high" if ai_score > 0.80 or ai_score < 0.20 else "medium",
            "raw_labels": results
        }

huggingface_service = HuggingFaceService()
