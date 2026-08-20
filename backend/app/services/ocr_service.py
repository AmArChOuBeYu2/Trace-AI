import os
from backend.app.config import settings
from backend.app.services.ai_analysis_service import ai_analysis_service

class OCRService:
    @staticmethod
    def extract_text(filepath: str, mime_type: str) -> dict:
        """
        Extracts visible text from media assets. Uses Gemini visual intelligence if available.
        """
        if ai_analysis_service.client and os.path.exists(filepath):
            try:
                with open(filepath, "rb") as f:
                    file_bytes = f.read()
                
                prompt = """
                You are a forensic OCR tool. Perform OCR on this image. 
                Identify and extract all visible text. 
                Include your confidence (0.0 to 1.0).
                Respond in JSON:
                {
                  "text": "Full extracted text content",
                  "confidence": 0.95,
                  "language": "en"
                }
                """
                response = ai_analysis_service.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        {"inline_data": {"mime_type": mime_type, "data": file_bytes}},
                        prompt
                    ]
                )
                import json
                text = response.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                return json.loads(text)
            except Exception as e:
                print(f"[OCR] Gemini OCR extraction failed: {e}")
                
        # Heuristic fallback
        return {
            "text": "OCR extraction unavailable. Set GEMINI_API_KEY to enable automated text parsing.",
            "confidence": 0.0,
            "language": "unknown"
        }

    @staticmethod
    def extract_entities_and_claims(ocr_text: str) -> dict:
        """
        Parses OCR text or descriptions to extract claims, entities (names, locations, dates, orgs),
        and distinctive phrases for query searches.
        """
        result = {
            "claims": [],
            "names": [],
            "locations": [],
            "dates": [],
            "organizations": [],
            "distinctive_phrases": []
        }
        
        if not ocr_text or "OCR extraction unavailable" in ocr_text:
            return result
            
        from backend.app.services.ai_analysis_service import ai_analysis_service
        if ai_analysis_service.client:
            try:
                prompt = f"""
                You are a forensic document analyzer. Parse this extracted text:
                "{ocr_text}"
                
                Extract:
                1. Claims: A list of factual assertions or statements made.
                2. Names: A list of people mentioned.
                3. Locations: A list of geographical locations mentioned.
                4. Dates: A list of dates or time references.
                5. Organizations: A list of departments, companies, or organizations.
                6. Distinctive Phrases: A list of unique or distinctive word combinations suitable for reverse web searching.
                
                Respond strictly in JSON format matching this schema:
                {{
                  "claims": ["claim 1", "claim 2"],
                  "names": ["name 1"],
                  "locations": ["location 1"],
                  "dates": ["date 1"],
                  "organizations": ["org 1"],
                  "distinctive_phrases": ["phrase 1", "phrase 2"]
                }}
                """
                response = ai_analysis_service.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt
                )
                import json
                text = response.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                return json.loads(text)
            except Exception as e:
                print(f"[OCR] Claims extraction failed: {e}")
                
        # Heuristic fallback if Gemini is offline
        words = ocr_text.split()
        if len(words) > 3:
            result["distinctive_phrases"] = [" ".join(words[:4])]
        return result
