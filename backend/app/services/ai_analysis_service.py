import os
import json
from google import genai
from backend.app.config import settings

class AIAnalysisService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.client = None
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
                print("[AI] Gemini client initialized successfully.")
            except Exception as e:
                print(f"[AI] Failed to initialize Gemini client: {e}")

    def analyze_media(self, media_path: str, mime_type: str, ocr_text: str = None, metadata: dict = None, sampled_frames: list = None) -> dict:
        """
        Queries Gemini 2.5 Flash for multimodal forensics.
        For images: scans lighting, anatomical errors, composites, EXIF inconsistencies.
        For videos: scans sequence of sampled frames, temporal jumps, audio-visual alignment.
        """
        if self.client and os.path.exists(media_path):
            try:
                is_video = mime_type.startswith("video/")
                contents = []
                
                # 1. Load media assets into contents list
                if is_video and sampled_frames:
                    # Load the 5 sampled video frames in sequence
                    for idx, frame_path in enumerate(sampled_frames):
                        if os.path.exists(frame_path):
                            with open(frame_path, "rb") as f_img:
                                f_bytes = f_img.read()
                            contents.append({
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": f_bytes
                                }
                            })
                    if not contents:
                        # Fallback to loading the original video file if no frames are present
                        with open(media_path, "rb") as f_orig:
                            contents.append({"inline_data": {"mime_type": mime_type, "data": f_orig.read()}})
                else:
                    # Single image or audio file
                    with open(media_path, "rb") as f_orig:
                        contents.append({"inline_data": {"mime_type": mime_type, "data": f_orig.read()}})

                # 2. Formulate explicit forensic query prompts
                if is_video:
                    prompt = f"""
                    You are a lead digital video forensics investigator for the Chandigarh Police.
                    Analyze this sequence of representative video frames chronologically.
                    Known Metadata: {json.dumps(metadata) if metadata else "None"}
                    Extracted OCR Text: {ocr_text if ocr_text else "None"}

                    Evaluate the video for:
                    - Temporal inconsistencies (unnatural jumps, background shifts, lighting changes between frames).
                    - Identity consistency (faces or silhouettes changing structure, blurring, or shape).
                    - Lip/audio sync mismatch indicators (if speech text is present but mismatch is suspected).
                    - Compositing signs or frame-level rendering errors.

                    Provide an evidence-backed score. Do not speculate; only state findings supported by evidence.
                    """
                else:
                    prompt = f"""
                    You are a lead digital image forensics investigator for the Chandigarh Police.
                    Analyze this image.
                    Known Metadata: {json.dumps(metadata) if metadata else "None"}
                    Extracted OCR Text: {ocr_text if ocr_text else "None"}

                    Evaluate the image for:
                    - Visual manipulation indicators (compositing edges, cloning, stamp artifacts).
                    - Inconsistent lighting/shadows (angles mismatch, specular reflection errors).
                    - Anatomical inconsistencies (distorted fingers, ears, asymmetrical features, AI artifacts).
                    - Text/sign rendering errors or contextual anomalies.

                    Provide an evidence-backed score. Do not speculate; only state findings supported by evidence.
                    """

                prompt += """
                Respond strictly in JSON format matching this schema:
                {
                  "ai_generation_likelihood": float (0.0 to 1.0),
                  "manipulation_likelihood": float (0.0 to 1.0),
                  "confidence": "low" | "medium" | "high",
                  "summary": "Detailed forensic visual assessment summary.",
                  "indicators": [
                     {
                       "category": "visual" | "metadata" | "audio" | "temporal",
                       "finding": "Forensic indicator name/finding description.",
                       "severity": "info" | "low" | "medium" | "high" | "critical",
                       "confidence": "low" | "medium" | "high" | "conclusive",
                       "evidence_level": "OBSERVED" | "INFERRED" | "CONCLUSION",
                       "details": "Technical evidence supporting the finding."
                     }
                  ]
                }
                """
                
                # Append the prompt to contents
                contents.append(prompt)
                
                response = self.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents
                )
                
                # Parse JSON block from response
                text = response.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                
                return json.loads(text)
                
            except Exception as e:
                print(f"[AI] Gemini analysis failed: {e}")
                
        # Graceful Local Fallback
        return self._run_rule_based_ai_assessment(ocr_text, metadata)

    def _run_rule_based_ai_assessment(self, ocr_text: str = None, metadata: dict = None) -> dict:
        """
        Generates a rule-based forensic score from local signs.
        """
        ai_score = 0.15  # default low baseline
        manip_score = 0.10
        indicators = []
        confidence = "medium"
        
        # Heuristic 1: Photoshop/editing suite software tag
        if metadata and metadata.get("software"):
            software = metadata.get("software").lower()
            if any(x in software for x in ["photoshop", "gimp", "illustrator", "canva"]):
                manip_score = 0.75
                ai_score = 0.30
                indicators.append({
                    "category": "metadata",
                    "finding": f"Software signature indicates image editing: {metadata['software']}",
                    "severity": "high",
                    "confidence": "high",
                    "evidence_level": "INFERRED",
                    "details": "EXIF tags record modification metadata directly."
                })
        
        # Heuristic 2: Missing Camera EXIF in standard images
        if metadata and metadata.get("format") == "JPEG" and not metadata.get("exif_present"):
            manip_score = max(manip_score, 0.45)
            indicators.append({
                "category": "metadata",
                "finding": "Standard camera metadata headers are entirely missing.",
                "severity": "medium",
                "confidence": "medium",
                "evidence_level": "INFERRED",
                "details": "Consumer digital camera files typically possess standard EXIF tags. Complete absence implies re-saving, stripping, or synthetic creation."
            })
            
        # Heuristic 3: OCR keywords warning
        if ocr_text:
            text_lower = ocr_text.lower()
            scam_keywords = ["lottery", "winner", "account suspended", "urgent action required", "send money"]
            if any(kw in text_lower for kw in scam_keywords):
                manip_score = max(manip_score, 0.80)
                indicators.append({
                    "category": "visual",
                    "finding": "Media OCR contains text matching standard scam / influence operations templates.",
                    "severity": "high",
                    "confidence": "high",
                    "evidence_level": "INFERRED",
                    "details": "Discovered keywords commonly associated with digital manipulation narratives."
                })
                
        # Heuristic 4: If no indicators at all
        if not indicators:
            indicators.append({
                "category": "visual",
                "finding": "No clear local visual manipulation indicators found in current rule engine.",
                "severity": "info",
                "confidence": "medium",
                "evidence_level": "CONCLUSION",
                "details": "Standard digital boundaries and parameters are consistent with baseline records."
            })

        summary = "AI analysis fallback. Assessment generated via deterministic rule engine checks."
        if manip_score > 0.60:
            summary = "Technical metadata signature and content cues are consistent with external editing or modification."

        return {
            "ai_generation_likelihood": round(ai_score, 2),
            "manipulation_likelihood": round(manip_score, 2),
            "confidence": confidence,
            "summary": summary,
            "indicators": indicators
        }
        
    def generate_narrative_evolution(self, versions: list) -> dict:
        """
        Uses Gemini to compare how narratives shifted. Falls back to string comparisons.
        """
        if self.client and len(versions) >= 2:
            try:
                prompt = f"""
                You are a forensic analyst. Compare the following text captions/headlines representing different versions of a media asset in chronological order:
                {json.dumps(versions, indent=2)}

                Assess the semantic shift. Did the claims intensify, change context, become sensationalized or accusatory?
                Return a JSON output structured as:
                {{
                  "evolution_pattern": "e.g., Contextual -> Assertive -> Accusatory",
                  "summary": "Brief explanation of the changes and how context was added/removed.",
                  "intensity_score": float (0.0 to 1.0),
                  "shifts": [
                     {{
                       "from_version": int,
                       "to_version": int,
                       "observed_shift": "Description of the shift",
                       "wording_changes": "Detailed changes",
                       "sentiment_shift": "e.g. Neutral to Accusatory"
                     }}
                  ]
                }}
                """
                response = self.client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt
                )
                text = response.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                return json.loads(text)
            except Exception as e:
                print(f"[AI] Narrative reasoning failed: {e}")
                
        # Heuristic Narrative Shift Fallback
        return self._run_rule_based_narrative(versions)
        
    def _run_rule_based_narrative(self, versions: list) -> dict:
        if len(versions) < 2:
            return {
                "evolution_pattern": "Insufficient versions",
                "summary": "Requires at least 2 versions to determine shift.",
                "intensity_score": 0.0,
                "shifts": []
            }
            
        shifts = []
        for i in range(len(versions) - 1):
            v1 = versions[i].get("text", "")
            v2 = versions[i+1].get("text", "")
            
            # Simple length and punctuation change comparison
            v1_len = len(v1.split())
            v2_len = len(v2.split())
            
            exclamation_added = ("!" in v2) and ("!" not in v1)
            
            observed = "Moderate wording refinement."
            sentiment = "Neutral"
            
            if exclamation_added:
                observed = "Escalation in emphasis and punctuation."
                sentiment = "Slightly Sensationalized"
            elif abs(v2_len - v1_len) > 5:
                observed = "Contextual expansion / assertion addition."
                sentiment = "Information Expansion"
                
            shifts.append({
                "from_version": i + 1,
                "to_version": i + 2,
                "observed_shift": observed,
                "wording_changes": f"Version {i+2} contains {v2_len} words, compared to {v1_len} in Version {i+1}.",
                "sentiment_shift": sentiment
            })
            
        return {
            "evolution_pattern": "Observed Refinements",
            "summary": "Rule-based assessment shows structural variations across captions.",
            "intensity_score": 0.35,
            "shifts": shifts
        }

ai_analysis_service = AIAnalysisService()
