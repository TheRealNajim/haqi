"""Adapter contract: every source of truth implements this."""
from abc import ABC, abstractmethod
from app.schemas import Evidence


class AdapterError(Exception):
    """Raised after retries exhausted — agent must degrade gracefully, never crash."""


class BaseAdapter(ABC):
    source_type: str = "base"

    @abstractmethod
    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        """Fetch findings for a location. Raise AdapterError on total failure."""
