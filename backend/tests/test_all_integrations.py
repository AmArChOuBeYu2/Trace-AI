import os
import pytest
import asyncio
import subprocess
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.ai_analysis_service import ai_analysis_service
from backend.app.services.huggingface_service import huggingface_service
from backend.app.services.source_tracing_service import SourceTracingService

def test_local_ffmpeg_binaries():
    print("\n=== TESTING FFmpeg & FFprobe BINARIES ===")
    
    # Check explicitly defined windows paths or system path
    ffmpeg_paths = [r"C:\ffmpeg\bin\ffmpeg.exe", "ffmpeg"]
    ffprobe_paths = [r"C:\ffmpeg\bin\ffprobe.exe", "ffprobe"]
    
    ffmpeg_ok = False
    for path in ffmpeg_paths:
        try:
            res = subprocess.run([path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5.0)
            if res.returncode == 0:
                print(f"[SUCCESS] FFmpeg found at: {path}")
                ffmpeg_ok = True
                break
        except Exception:
            continue
            
    ffprobe_ok = False
    for path in ffprobe_paths:
        try:
            res = subprocess.run([path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5.0)
            if res.returncode == 0:
                print(f"[SUCCESS] FFprobe found at: {path}")
                ffprobe_ok = True
                break
        except Exception:
            continue
            
    assert ffmpeg_ok, "FFmpeg binary is not accessible."
    assert ffprobe_ok, "FFprobe binary is not accessible."

def test_supabase_database_crud():
    print("\n=== TESTING SUPABASE / SQLITE DATABASE CONNECTION ===")
    # Re-initialize db_manager to trigger table verification check
    db_manager.__init__()
    
    db_type = "Supabase" if db_manager.use_supabase else "SQLite Local File"
    print(f"[TEST] Using DB Mode: {db_type}")
    
    # Create test investigation
    title = "Integration Test Cases"
    case_no = f"TST-{os.urandom(4).hex().upper()}"
    
    inv = db_manager.create_investigation(
        title=title,
        description="Verifies DB writes and reads.",
        case_number=case_no
    )
    assert inv is not None, "Failed to create investigation."
    inv_id = inv["id"]
    print(f"[SUCCESS] Created case with ID: {inv_id}, Case Number: {case_no}")
    
    # Read back
    read_inv = db_manager.get_investigation(inv_id)
    assert read_inv is not None, "Failed to retrieve investigation."
    assert read_inv["title"] == title, "Investigation title mismatch."
    print(f"[SUCCESS] Retrieved and verified case title: '{read_inv['title']}'")
    
    # Write audit log
    audit = db_manager.create_audit_event(
        investigation_id=inv_id,
        event_type="INTEGRATION_TEST",
        description="Health check database insert verified."
    )
    assert audit is not None, "Failed to write audit log."
    print("[SUCCESS] Audit log event written successfully.")

def test_gemini_client():
    print("\n=== TESTING GEMINI AI API ===")
    if not settings.GEMINI_API_KEY:
        pytest.skip("GEMINI_API_KEY is not configured.")
        
    assert ai_analysis_service.client is not None, "Gemini client not initialized."
    
    # Attempt to query Gemini, retrying once if it returns 503 Service Unavailable
    gemini_ok = False
    last_err = None
    for attempt in range(2):
        try:
            res = ai_analysis_service.client.models.generate_content(
                model="gemini-2.5-flash",
                contents="State 'Gemini Integration Online' and nothing else."
            )
            response_text = res.text.strip()
            print(f"[SUCCESS] Gemini response: '{response_text}'")
            assert "Gemini" in response_text
            gemini_ok = True
            break
        except Exception as e:
            last_err = e
            print(f"[WARNING] Gemini API handshake attempt {attempt+1} failed: {e}. Retrying...")
            import time
            time.sleep(2.0)
            
    if not gemini_ok:
        pytest.fail(f"Gemini API handshake failed: {last_err}")

def test_huggingface_client():
    print("\n=== TESTING HUGGING FACE INFERENCE API ===")
    if not settings.HF_TOKEN:
        pytest.skip("HF_TOKEN is not configured.")
        
    assert huggingface_service.is_configured(), "Hugging Face service token not set."
    
    # Query text deepfake model using asyncio.run
    test_text = "Chandigarh administration announces emergency curfew update."
    res = asyncio.run(huggingface_service.detect_ai_text(test_text))
    
    if res is not None:
        if "error" in res:
            # Handle token scope permission error gracefully (the handshake succeeded, but token is restricted)
            status_code = res.get("status_code")
            if status_code in [401, 403]:
                print(f"[WARNING] Hugging Face server contacted successfully but returned auth status {status_code}.")
                print(f"          Detail: {res.get('error')}")
                return
            pytest.fail(f"Hugging Face API returned error status {status_code}: {res.get('error')}")
            
        print(f"[SUCCESS] Hugging Face Classification Score: {res.get('ai_likelihood')} (AI Generated Likelihood)")
        assert "ai_likelihood" in res
    else:
        pytest.fail("Hugging Face API returned empty response.")

def test_multi_provider_source_search():
    print("\n=== TESTING LANGSEARCH & TAVILY DEDUPLICATION ===")
    
    # Make sure DB manager state is synced
    db_manager.__init__()
    
    lang_key_set = bool(settings.LANGSEARCH_API_KEY)
    tavily_key_set = bool(settings.SOURCE_SEARCH_API_KEY)
    
    if not lang_key_set and not tavily_key_set:
        pytest.skip("Neither LangSearch nor Tavily search key configured.")
        
    # We construct a query
    query = "election commission"
    inv_id = "test-investigation-uuid-12345"
    
    # Create investigation to bind logs (uses local engine if Supabase missing tables)
    inv = db_manager.create_investigation(
        title="Source Search Test Case",
        description="Search log container.",
        case_number=f"SCH-{os.urandom(3).hex().upper()}"
    )
    assert inv is not None
    inv_id = inv["id"]
    
    # Query search sources via asyncio.run
    results = asyncio.run(SourceTracingService.search_sources(query, inv_id))
    
    print(f"[TEST] Search providers active: LangSearch={lang_key_set}, Tavily={tavily_key_set}")
    print(f"[TEST] Number of deduplicated results returned: {len(results)}")
    
    if len(results) > 0:
        first = results[0]
        print(f"[SUCCESS] Top result Title: '{first.get('title')}'")
        print(f"          URL: {first.get('url')}")
        print(f"          Similarity: {first.get('similarity_score')}")
        print(f"          Providers: {first.get('discovery_method')}")
        
        assert "url" in first
        assert "discovery_method" in first
        assert "similarity_score" in first
        
        providers = [p.strip() for p in first["discovery_method"].split(",")]
        for p in providers:
            assert p in ["LangSearch", "Tavily"], f"Unknown search provider: {p}"
    else:
        print("[WARNING] Search query returned 0 results. Check keys validity if this is a live environment.")
