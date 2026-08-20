from abc import ABC, abstractmethod
from typing import List, Dict, Any

class SourceSearchProvider(ABC):
    @abstractmethod
    async def search(self, query: str, count: int = 10) -> List[Dict[str, Any]]:
        """
        Executes a web search query.
        Returns a list of structured source dictionary objects:
        {
            "url": str,
            "domain": str,
            "title": str,
            "platform": str, # classified (Source Candidate, Related Source, Earliest Discovered)
            "publication_time": str | None,
            "discovery_method": str, # provider name(s)
            "similarity_score": float, # 0.0 - 1.0 relevance
            "confidence": str, # low, medium, high
            "evidence": dict # detailed snippet, summary, crawl timestamp, etc.
        }
        """
        pass
