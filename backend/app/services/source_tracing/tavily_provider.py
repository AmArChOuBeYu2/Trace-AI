import time
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from backend.app.config import settings
from backend.app.services.source_tracing.provider_base import SourceSearchProvider

class TavilyProvider(SourceSearchProvider):
    def __init__(self):
        self.api_key = settings.SOURCE_SEARCH_API_KEY
        self.base_url = "https://api.tavily.com/search"
        
        # In-memory query cache
        self._cache: Dict[str, tuple] = {}
        self.cache_ttl = timedelta(hours=24)
        
        # Simple rate limiter state: minimum delay of 1.0 seconds between queries
        self._last_request_time = 0.0
        self.min_request_delay = 1.0 

    def _get_cache_key(self, query: str, count: int) -> str:
        return f"{query}||{count}"

    def _enforce_rate_limit(self):
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.min_request_delay:
            sleep_time = self.min_request_delay - elapsed
            time.sleep(sleep_time)
        self._last_request_time = time.time()

    async def search(self, query: str, count: int = 10) -> List[Dict[str, Any]]:
        """
        Performs a web search via the Tavily Search API.
        Enforces local caching, rate limiting, and timeout/retry parameters.
        """
        # Read key dynamically from settings
        self.api_key = settings.SOURCE_SEARCH_API_KEY
        
        if not self.api_key:
            print("[TAVILY] API Key not configured. Skipping active search.")
            return []

        # Check Cache
        cache_key = self._get_cache_key(query, count)
        if cache_key in self._cache:
            cached_time, cached_data = self._cache[cache_key]
            if datetime.utcnow() - cached_time < self.cache_ttl:
                print(f"[TAVILY] Returning cached results for query: '{query}'")
                return cached_data

        # Enforce Rate Limiting
        self._enforce_rate_limit()

        headers = {
            "Content-Type": "application/json"
        }
        
        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": False,
            "max_results": min(max(count, 1), 10)
        }

        max_retries = 3
        backoff_delay = 1.5
        timeout = 10.0

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        self.base_url, 
                        headers=headers, 
                        json=payload, 
                        timeout=timeout
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        parsed_results = self._parse_results(data, query)
                        
                        # Store in Cache
                        self._cache[cache_key] = (datetime.utcnow(), parsed_results)
                        return parsed_results
                    
                    elif response.status_code == 429:
                        print(f"[TAVILY] HTTP 429 Rate Limited. Attempt {attempt + 1}/{max_retries}. Backing off.")
                        time.sleep(backoff_delay * 2)
                        
                    elif response.status_code >= 500:
                        print(f"[TAVILY] Server Error {response.status_code}. Attempt {attempt + 1}/{max_retries}.")
                        time.sleep(backoff_delay)
                        
                    else:
                        print(f"[TAVILY] HTTP Error {response.status_code}: {response.text}")
                        break
                        
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                print(f"[TAVILY] Connection error/timeout during search attempt {attempt + 1}/{max_retries}: {exc}")
                time.sleep(backoff_delay)
                
            backoff_delay *= 2

        print(f"[TAVILY] Search execution failed for query: '{query}' after {max_retries} attempts.")
        return []

    def _parse_results(self, response_data: Dict[str, Any], query: str) -> List[Dict[str, Any]]:
        """
        Parses Tavily response structure.
        """
        results = []
        raw_results = response_data.get("results", [])
        
        if not raw_results:
            return []

        # Classification heuristics
        for idx, val in enumerate(raw_results):
            url = val.get("url", "")
            title = val.get("title", "Untitled Resource")
            snippet = val.get("content", "")
            similarity = val.get("score", 1.0 - (idx * 0.08)) # Map relevance score (often float)
            pub_date = val.get("published_date") # Tavily occasionally returns date if available
            
            domain = url.split("//")[-1].split("/")[0] if url else "unknown.com"
            similarity = max(min(similarity, 1.0), 0.20)
            
            if similarity > 0.85:
                classification = "Source Candidate"
                confidence = "high"
            else:
                classification = "Related Source"
                confidence = "medium"

            evidence_details = {
                "snippet": snippet,
                "summary": "",
                "crawl_timestamp": datetime.utcnow().isoformat() + "Z",
                "relevance_rank": idx + 1,
                "classification_rationale": f"Matched query terms inside Tavily search index. Score: {similarity}",
                "query": query
            }

            results.append({
                "url": url,
                "domain": domain,
                "title": title,
                "platform": classification,
                "publication_time": pub_date,
                "discovery_method": "Tavily",
                "similarity_score": similarity,
                "confidence": confidence,
                "evidence": evidence_details
            })

        return results

tavily_provider = TavilyProvider()
