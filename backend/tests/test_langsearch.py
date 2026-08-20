import os
import pytest
import asyncio
import time
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.source_tracing.langsearch_provider import langsearch_provider
from backend.app.services.source_tracing_service import SourceTracingService

def test_langsearch_integration():
    print("\n--- STARTING LANGSEARCH INTEGRATION TEST ---")
    
    # Save original key
    original_key = settings.LANGSEARCH_API_KEY
    
    # Temporarily set dummy key if not configured in environment, to test HTTP unauthorized handshake
    if not settings.LANGSEARCH_API_KEY:
        print("[TEST] No LANGSEARCH_API_KEY detected in .env. Using mock-test credentials to test network route.")
        settings.LANGSEARCH_API_KEY = "test_unauthorized_credential_key"
        
    # Synchronize the provider's key
    langsearch_provider.api_key = settings.LANGSEARCH_API_KEY
    print(f"[TEST] Using API Key (truncated): {settings.LANGSEARCH_API_KEY[:6]}...")
    
    # Create a dynamic case number using current timestamp to avoid database unique index conflicts
    dynamic_case_no = f"LST-{int(time.time())}"
    
    # 1. Create a dummy case in SQLite/Supabase for logging
    inv = db_manager.create_investigation(
        title="LangSearch Integration Test Case",
        description="Verifies real HTTP queries and database bindings.",
        case_number=dynamic_case_no
    )
    assert inv is not None
    inv_id = inv["id"]
    print(f"[TEST] Database case created. Case reference ID: {inv_id}")

    # 2. Run query through provider
    query = "election ballot sector 17"
    print(f"[TEST] Dispatching query to LangSearch API: '{query}'")
    
    results = []
    http_status = "Skipped (No connection)"
    
    async def run_query():
        nonlocal http_status, results
        try:
            results = await langsearch_provider.search(query=query, count=2)
            if len(results) > 0:
                http_status = "200 Success"
            else:
                # If no results (dummy key), the provider returned [] because it caught a 401/403.
                # Let's inspect a direct endpoint ping to report the exact HTTP status code
                import httpx
                async with httpx.AsyncClient() as client:
                    res = await client.post(
                        "https://api.langsearch.com/v1/web-search",
                        headers={"Authorization": f"Bearer {settings.LANGSEARCH_API_KEY}"},
                        json={"query": query, "count": 2}
                    )
                    http_status = f"{res.status_code} {res.reason_phrase}"
        except Exception as e:
            http_status = f"Network Error: {e}"

    # Execute async wrapper
    asyncio.run(run_query())

    print(f"[TEST] HTTP Handshake Result: {http_status}")
    print(f"[TEST] Number of results returned by provider: {len(results)}")

    if len(results) > 0:
        # Verify result parsing
        first = results[0]
        print(f"[TEST] Parsed Result Sample:")
        print(f"  - Title: {first.get('title')}")
        print(f"  - URL: {first.get('url')}")
        print(f"  - Platform: {first.get('platform')}")
        print(f"  - Similarity Score: {first.get('similarity_score')}")
        
        # Verify fields required by requirements
        assert "url" in first
        assert "domain" in first
        assert "title" in first
        assert "platform" in first
        assert "evidence" in first

        # 3. Store search results in database
        print("[TEST] Testing database persistence...")
        for cand in results:
            stored = db_manager.create_source_candidate(
                investigation_id=inv_id,
                url=cand["url"],
                domain=cand["domain"],
                title=cand["title"],
                platform=cand["platform"],
                publication_time=cand["publication_time"],
                discovery_method=cand["discovery_method"],
                similarity_score=cand["similarity_score"],
                confidence=cand["confidence"],
                evidence=str(cand["evidence"])
            )
            assert stored is not None
            
        print("[TEST] Database persistence confirmed: Candidates written successfully!")
    else:
        print("[TEST] Skipping database write checks because query returned 0 results (expected for invalid key).")
        
        # Clear settings key to force-test fallback warning code path
        settings.LANGSEARCH_API_KEY = ""
        
        async def run_fallback():
             return await SourceTracingService.search_sources(query, inv_id)
        candidates = asyncio.run(run_fallback())
        assert len(candidates) == 0
        
        # Verify warning audit event was written
        audits = db_manager.get_audit_events(inv_id)
        has_warning = any("LangSearch API key not configured" in a.get("description", "") for a in audits)
        assert has_warning
        print("[TEST] Warning audit logs verified.")

    # Reset configuration state
    settings.LANGSEARCH_API_KEY = original_key
    langsearch_provider.api_key = original_key
    print("--- LANGSEARCH INTEGRATION TEST COMPLETE ---\n")
