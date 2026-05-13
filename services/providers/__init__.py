"""Free-API providers that replace Colab GPU servers.

All providers expose an async client that returns a dict
``{"url": str, "duration_ms": int, "raw": dict}`` for media outputs,
or raises ``ProviderError``/``ProviderUnavailable`` on failure.

The video orchestrator chooses one provider per stage; failures cascade
through the fallback list defined in ``services.video_pipeline``.
"""

from .base import ProviderError, ProviderUnavailable, ProviderResult

__all__ = ["ProviderError", "ProviderUnavailable", "ProviderResult"]
