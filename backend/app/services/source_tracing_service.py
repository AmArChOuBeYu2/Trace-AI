import json
import asyncio
from datetime import datetime
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.source_tracing.langsearch_provider import langsearch_provider
from backend.app.services.source_tracing.tavily_provider import tavily_provider

class SourceTracingService:
    @staticmethod
    async def search_sources(keywords: str, investigation_id: str) -> list:
        """
        Queries LangSearch and Tavily search providers in parallel, merges/deduplicates
        results by URL, ranks them, and writes candidate mappings to the database.
        """
        langsearch_active = bool(settings.LANGSEARCH_API_KEY)
        tavily_active = bool(settings.SOURCE_SEARCH_API_KEY)

        if not langsearch_active and not tavily_active:
            warning_msg = "Web source tracing unavailable: Neither LangSearch nor Tavily API keys are configured."
            print(f"[SEARCH] {warning_msg}")
            db_manager.create_audit_event(
                investigation_id=investigation_id,
                event_type="SOURCE_SEARCH_WARNING",
                description=warning_msg
            )
            return []

        print(f"[SEARCH] Launching multi-provider search for terms: '{keywords}'")
        
        # Build tasks list dynamically
        tasks = []
        if langsearch_active:
            tasks.append(langsearch_provider.search(query=keywords, count=10))
        if tavily_active:
            tasks.append(tavily_provider.search(query=keywords, count=10))

        # Query active providers concurrently
        search_responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        raw_candidates = []
        for res in search_responses:
            if isinstance(res, list):
                raw_candidates.extend(res)
            elif isinstance(res, Exception):
                print(f"[SEARCH] A search provider query failed with exception: {res}")

        # Deduplicate results by URL
        # Normalizing URL (strip trailing slashes, lowercase domains)
        deduped = {}
        for cand in raw_candidates:
            url = cand.get("url", "").strip()
            if not url:
                continue
                
            norm_url = url.lower().rstrip("/")
            
            if norm_url in deduped:
                # Merge logic
                existing = deduped[norm_url]
                
                # Append provider info if not already there
                existing_methods = [m.strip() for m in existing["discovery_method"].split(",")]
                current_method = cand["discovery_method"]
                if current_method not in existing_methods:
                    existing["discovery_method"] = f"{existing['discovery_method']}, {current_method}"
                
                # Keep highest similarity score
                if cand["similarity_score"] > existing["similarity_score"]:
                    existing["similarity_score"] = cand["similarity_score"]
                    existing["title"] = cand["title"]
                    existing["confidence"] = cand["confidence"]
                    
                # Combine evidence metadata
                existing_ev = existing["evidence"]
                current_ev = cand["evidence"]
                merged_evidence = {
                    "langsearch_metadata": existing_ev if "LangSearch" in existing["discovery_method"] else current_ev,
                    "tavily_metadata": current_ev if "Tavily" in existing["discovery_method"] else existing_ev,
                    "merged_at": datetime.utcnow().isoformat() + "Z",
                    "snippets": [
                        existing_ev.get("snippet"),
                        current_ev.get("snippet")
                    ]
                }
                existing["evidence"] = merged_evidence
            else:
                # Add new
                deduped[norm_url] = cand

        # Format candidates list
        final_candidates = list(deduped.values())
        
        # Sort by similarity score descending
        final_candidates.sort(key=lambda x: x["similarity_score"], reverse=True)

        db_manager.create_audit_event(
            investigation_id=investigation_id,
            event_type="SOURCE_SEARCH_COMPLETED",
            description=f"Multi-provider search completed. Found {len(final_candidates)} deduplicated source candidates."
        )

        formatted_candidates = []
        for cand in final_candidates:
            # Check if evidence is dict and stringify
            evidence_str = json.dumps(cand["evidence"]) if isinstance(cand["evidence"], dict) else str(cand["evidence"])
            
            formatted_candidates.append({
                "url": cand["url"],
                "domain": cand["domain"],
                "title": cand["title"],
                "platform": cand["platform"],
                "publication_time": cand["publication_time"],
                "discovery_method": cand["discovery_method"],
                "similarity_score": cand["similarity_score"],
                "confidence": cand["confidence"],
                "evidence": evidence_str
            })

        return formatted_candidates
