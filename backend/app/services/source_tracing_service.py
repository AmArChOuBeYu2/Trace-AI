import json
import asyncio
from datetime import datetime
from backend.app.config import settings
from backend.app.database import db_manager
from backend.app.services.source_tracing.langsearch_provider import langsearch_provider
from backend.app.services.source_tracing.tavily_provider import tavily_provider

class SourceTracingService:
    @staticmethod
    async def search_sources(queries: list, investigation_id: str) -> list:
        """
        Queries LangSearch and Tavily search providers in parallel for each query,
        merges/deduplicates results by URL, and formats candidates with rich metadata.
        """
        if isinstance(queries, str):
            queries = [queries]

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

        raw_candidates = []

        # Execute searches for each generated query
        for q in queries:
            print(f"[SEARCH] Launching multi-provider search for query: '{q}'")
            tasks = []
            if langsearch_active:
                tasks.append(langsearch_provider.search(query=q, count=5))
            if tavily_active:
                tasks.append(tavily_provider.search(query=q, count=5))

            if tasks:
                search_responses = await asyncio.gather(*tasks, return_exceptions=True)
                for res in search_responses:
                    if isinstance(res, list):
                        for cand in res:
                            cand["query"] = q
                        raw_candidates.extend(res)
                    elif isinstance(res, Exception):
                        print(f"[SEARCH] Search provider query failed for '{q}': {res}")

        # Deduplicate results by URL
        deduped = {}
        for cand in raw_candidates:
            url = cand.get("url", "").strip()
            if not url:
                continue

            norm_url = url.lower().rstrip("/")

            if norm_url in deduped:
                existing = deduped[norm_url]
                if cand.get("query") and cand.get("query") not in existing.get("queries", []):
                    existing["queries"].append(cand["query"])
                
                # Append provider to existing providers list
                provider = cand.get("discovery_method") or "web_search"
                if provider not in existing.get("providers", []):
                    existing["providers"].append(provider)

                # Keep highest similarity score
                if cand.get("similarity_score", 0.0) > existing.get("similarity_score", 0.0):
                    existing["similarity_score"] = cand["similarity_score"]
                    existing["title"] = cand["title"]
                    existing["confidence"] = cand["confidence"]
                    if cand.get("query"):
                        existing["query"] = cand["query"]
            else:
                cand["queries"] = [cand.get("query")] if cand.get("query") else []
                cand["providers"] = [cand.get("discovery_method")] if cand.get("discovery_method") else ["web_search"]
                deduped[norm_url] = cand

        final_candidates = list(deduped.values())
        final_candidates.sort(key=lambda x: x.get("similarity_score", 0.0), reverse=True)

        # Audit log event with results count
        db_manager.create_audit_event(
            investigation_id=investigation_id,
            event_type="SOURCE_SEARCH_COMPLETED",
            description=f"Multi-provider search completed. Found {len(final_candidates)} deduplicated source candidates.",
            metadata_json={"results_count": len(final_candidates)}
        )

        formatted_candidates = []
        for cand in final_candidates:
            # Parse snippet details
            snippet = ""
            if cand.get("evidence"):
                if isinstance(cand["evidence"], dict):
                    snippet = cand["evidence"].get("snippet", "")
                else:
                    snippet = str(cand["evidence"])

            evidence_dict = {
                "query": cand.get("query") or (cand.get("queries")[0] if cand.get("queries") else ""),
                "queries": cand.get("queries", []),
                "providers": cand.get("providers", [cand.get("discovery_method", "web_search")]),
                "snippet": snippet,
                "discovery_date": datetime.utcnow().isoformat() + "Z",
                "relevance": cand.get("similarity_score", 1.0),
                "confidence": cand.get("confidence", "medium")
            }

            formatted_candidates.append({
                "url": cand["url"],
                "domain": cand["domain"],
                "title": cand["title"],
                "platform": cand["platform"],
                "publication_time": cand["publication_time"],
                "discovery_method": cand["discovery_method"],
                "similarity_score": cand["similarity_score"],
                "confidence": cand["confidence"],
                "evidence": json.dumps(evidence_dict)
            })

        return formatted_candidates
