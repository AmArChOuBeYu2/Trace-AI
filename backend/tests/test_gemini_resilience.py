import os
import pytest
from unittest.mock import MagicMock, patch
from backend.app.services.ai_analysis_service import ai_analysis_service
from google.genai import types

@pytest.fixture(autouse=True)
def setup_dummy_media():
    with open("test.jpg", "wb") as f:
        f.write(b"dummy image content")
    yield
    if os.path.exists("test.jpg"):
        os.remove("test.jpg")

def test_gemini_primary_success():
    print("\n=== RUNNING GEMINI RESILIENCE TEST: PRIMARY SUCCESS ===")
    with patch.object(ai_analysis_service.client.models, 'generate_content') as mock_gen:
        mock_response = MagicMock()
        mock_response.text = '{"ai_generation_likelihood": 0.05, "manipulation_likelihood": 0.12, "confidence": "high", "summary": "Image appears authentic.", "indicators": []}'
        mock_gen.return_value = mock_response
        
        res = ai_analysis_service.analyze_media("test.jpg", "image/jpeg", "text", {})
        assert res.get("ai_status") != "UNAVAILABLE"
        assert res.get("manipulation_likelihood") == 0.12
        print("[SUCCESS] Primary model returned response correctly.")

def test_gemini_fallback_on_503():
    print("\n=== RUNNING GEMINI RESILIENCE TEST: FALLBACK ON 503 ===")
    
    call_count = 0
    def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("503 Service Unavailable: High demand")
        
        mock_response = MagicMock()
        mock_response.text = '{"ai_generation_likelihood": 0.05, "manipulation_likelihood": 0.12, "confidence": "high", "summary": "Image appears authentic.", "indicators": []}'
        return mock_response
        
    with patch.object(ai_analysis_service.client.models, 'generate_content', side_effect=mock_generate):
        res = ai_analysis_service.analyze_media("test.jpg", "image/jpeg", "text", {})
        assert res.get("ai_status") != "UNAVAILABLE"
        assert res.get("manipulation_likelihood") == 0.12
        assert call_count > 1
        print("[SUCCESS] Falling back sequentially to next model succeeded.")

def test_gemini_all_unavailable_no_fabrication():
    print("\n=== RUNNING GEMINI RESILIENCE TEST: ALL UNAVAILABLE ===")
    
    def mock_generate(*args, **kwargs):
        raise Exception("503 Service Unavailable: High demand")
        
    with patch.object(ai_analysis_service.client.models, 'generate_content', side_effect=mock_generate):
        res = ai_analysis_service.analyze_media("test.jpg", "image/jpeg", "text", {})
        
        assert res.get("ai_status") == "UNAVAILABLE"
        assert "temporarily unavailable" in res.get("summary").lower()
        assert res.get("ai_generation_likelihood") is None
        assert res.get("manipulation_likelihood") is None
        assert res.get("confidence") is None
        assert len(res.get("indicators")) == 0
        print("[SUCCESS] Service marked unavailable. No metrics fabricated.")

def test_gemini_invalid_credentials():
    print("\n=== RUNNING GEMINI RESILIENCE TEST: INVALID CREDENTIALS ===")
    
    def mock_generate(*args, **kwargs):
        raise Exception("400 API key not valid")
        
    with patch.object(ai_analysis_service.client.models, 'generate_content', side_effect=mock_generate):
        res = ai_analysis_service.analyze_media("test.jpg", "image/jpeg", "text", {})
        
        assert res.get("ai_status") == "UNAVAILABLE"
        assert "invalid" in res.get("reason").lower() or "400" in res.get("reason").lower()
        assert res.get("ai_generation_likelihood") is None
        assert res.get("manipulation_likelihood") is None
        print("[SUCCESS] Invalid credentials handled correctly without fabrication.")
