import time
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from backend.app.config import settings
from backend.app.services.source_tracing.provider_base import SourceSearchProvider

class LangSearchProvider(SourceSearchProvider):
    def __init__(self):
        self.api_key = settings.LANGSEARCH_API_KEY
        self.base_url = "https://api.langsearch.com/v1/web-search"
        
        # In-memory query cache: maps key string -> (timestamp, response_data)
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
        Performs a web search via the LangSearch Web Search API.
        Enforces local caching, rate limiting, and timeout/retry parameters.
        """
        # Read key dynamically in case it gets updated in environment
        self.api_key = settings.LANGSEARCH_API_KEY
        
        if not self.api_key:
            print("[LANGSEARCH] API Key not configured. Skipping active search.")
            return []

        # Check Cache
        cache_key = self._get_cache_key(query, count)
        if cache_key in self._cache:
            cached_time, cached_data = self._cache[cache_key]
            if datetime.utcnow() - cached_time < self.cache_ttl:
                print(f"[LANGSEARCH] Returning cached results for query: '{query}'")
                return cached_data

        # Enforce Rate Limiting
        self._enforce_rate_limit()

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "query": query,
            "count": min(max(count, 1), 10),
            "freshness": "noLimit",
            "summary": True # Ask for summaries by default for forensic reporting richness
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
                        print(f"[LANGSEARCH] HTTP 429 Rate Limited. Attempt {attempt + 1}/{max_retries}. Backing off.")
                        time.sleep(backoff_delay * 2)
                        
                    elif response.status_code >= 500:
                        print(f"[LANGSEARCH] Server Error {response.status_code}. Attempt {attempt + 1}/{max_retries}.")
                        time.sleep(backoff_delay)
                        
                    else:
                        print(f"[LANGSEARCH] HTTP Error {response.status_code}: {response.text}")
                        break
                        
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                print(f"[LANGSEARCH] Connection error/timeout during search attempt {attempt + 1}/{max_retries}: {exc}")
                time.sleep(backoff_delay)
                
            backoff_delay *= 2

        print(f"[LANGSEARCH] Search execution failed for query: '{query}' after {max_retries} attempts.")
        return []

    def _parse_results(self, response_data: Dict[str, Any], query: str) -> List[Dict[str, Any]]:
        """
        Parses LangSearch response structure into TRACE-AI compatible lists.
        """
        results = []
        
        data_block = response_data.get("data", {})
        web_pages_block = data_block.get("webPages", {})
        values = web_pages_block.get("value", [])
        
        if not values:
            return []

        # Find oldest result to mark as "Earliest Discovered Public Instance"
        oldest_date = None
        oldest_index = -1

        for idx, val in enumerate(values):
            pub_date_str = val.get("datePublished")
            if pub_date_str:
                try:
                    pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                    if oldest_date is None or pub_date < oldest_date:
                        oldest_date = pub_date
                        oldest_index = idx
                except Exception:
                    pass

        for idx, val in enumerate(values):
            url = val.get("url", "")
            title = val.get("name", "Untitled Resource")
            snippet = val.get("snippet", "")
            summary_content = val.get("summary", "")
            pub_date = val.get("datePublished")
            crawl_date = val.get("dateLastCrawled")
            
            domain = url.split("//")[-1].split("/")[0] if url else "unknown.com"
            similarity = round(1.0 - (idx * 0.08), 2)
            similarity = max(similarity, 0.20)
            
            if idx == oldest_index:
                classification = "Earliest Discovered Public Instance"
                confidence = "high"
            elif similarity > 0.85:
                classification = "Source Candidate"
                confidence = "high"
            else:
                classification = "Related Source"
                confidence = "medium"

            evidence_details = {
                "snippet": snippet,
                "summary": summary_content,
                "crawl_timestamp": crawl_date,
                "relevance_rank": idx + 1,
                "classification_rationale": "Matched query terms inside LangSearch web index.",
                "query": query,
                "timestamp_state": "Observed" if val.get("datePublished") else "Estimated"
            }

            results.append({
                "url": url,
                "domain": domain,
                "title": title,
                "platform": classification,
                "publication_time": pub_date,
                "discovery_method": "LangSearch",
                "similarity_score": similarity,
                "confidence": confidence,
                "evidence": evidence_details
            })

        return results

langsearch_provider = LangSearchProvider()
