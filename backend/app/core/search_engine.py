"""Free-text search (technical document Sprint 27-28: "Performance optimization —
Elasticsearch migration for search"). Before this, Ovigo's search surfaces were
location-tag + date filtered only (see core/ranking.py's own docstring: "No
free-text query exists anywhere in this codebase") — a traveler could browse by
destination but never type "beach resort" or "family van" and get matches. This
module adds that, backed by a single-node Elasticsearch container running
alongside the backend on the same Dokploy VPS/Docker network (reachable at
`settings.elasticsearch_url`, no public exposure, no credentials — internal-only).

One index per listing type (`ovigo_tours`, `ovigo_properties`, `ovigo_vehicles`)
rather than one unified index — each module already has its own service.py/router.py
boundary, and a per-type index keeps that boundary rather than inventing a shared
document shape across three otherwise-unrelated models.

Graceful degradation is the load-bearing design choice here, matching every other
external-dependency integration in this codebase (core/fx.py, core/translate.py):
every function in this module swallows connection errors and returns `None` (search)
or does nothing (indexing) rather than raising. A traveler searching while
Elasticsearch is down (or in local dev, where it isn't running at all) falls back to
`tours/service.py`/etc.'s existing plain-Postgres `ILIKE` substring match — degraded
relevance, never a broken page. See each module's `list_published_*` for exactly how
that fallback is wired in.

Indexing is incremental, not read-time: `admin/service.py`'s `approve_tour`/
`approve_property`/`approve_vehicle` index a listing the moment it's first published,
and `tours/service.py::update_tour` (etc.) re-index it on every subsequent edit while
it stays published. There's no de-index-on-unpublish hook because no such flow exists
yet in this codebase (only DRAFT tours/properties/vehicles can be deleted — see each
module's `delete_*`). `scripts/reindex_search.py` is a one-time backfill for listings
that were already PUBLISHED before this feature existed.
"""
import uuid
from decimal import Decimal

from elasticsearch import AsyncElasticsearch, ConnectionError as ESConnectionError, TransportError

from app.config import get_settings

TOURS_INDEX = "ovigo_tours"
PROPERTIES_INDEX = "ovigo_properties"
VEHICLES_INDEX = "ovigo_vehicles"

_client: AsyncElasticsearch | None = None


def _get_client() -> AsyncElasticsearch:
    global _client
    if _client is None:
        _client = AsyncElasticsearch(get_settings().elasticsearch_url, request_timeout=3)
    return _client


async def index_tour(tour_id: uuid.UUID, title: str, description: str | None, base_price: Decimal) -> None:
    try:
        await _get_client().index(
            index=TOURS_INDEX,
            id=str(tour_id),
            document={"title": title, "description": description or "", "base_price": float(base_price)},
        )
    except (ESConnectionError, TransportError, OSError):
        pass


async def index_property(property_id: uuid.UUID, name: str, description: str | None, property_type: str) -> None:
    try:
        await _get_client().index(
            index=PROPERTIES_INDEX,
            id=str(property_id),
            document={"name": name, "description": description or "", "property_type": property_type},
        )
    except (ESConnectionError, TransportError, OSError):
        pass


async def index_vehicle(vehicle_id: uuid.UUID, make: str, model: str, description: str | None, vehicle_type: str) -> None:
    try:
        await _get_client().index(
            index=VEHICLES_INDEX,
            id=str(vehicle_id),
            document={"make": make, "model": model, "description": description or "", "vehicle_type": vehicle_type},
        )
    except (ESConnectionError, TransportError, OSError):
        pass


async def _search_ids(index: str, query: str, fields: list[str], limit: int) -> list[uuid.UUID] | None:
    """Returns matching document ids ranked by relevance, or `None` if Elasticsearch
    couldn't be reached — callers must treat `None` as "fall back," not "no matches"
    (an empty list, by contrast, is a real zero-result search)."""
    try:
        result = await _get_client().search(
            index=index,
            query={"multi_match": {"query": query, "fields": fields, "fuzziness": "AUTO"}},
            size=limit,
            _source=False,
        )
    except (ESConnectionError, TransportError, OSError):
        return None
    return [uuid.UUID(hit["_id"]) for hit in result["hits"]["hits"]]


async def search_tour_ids(query: str, limit: int = 100) -> list[uuid.UUID] | None:
    return await _search_ids(TOURS_INDEX, query, ["title^3", "description"], limit)


async def search_property_ids(query: str, limit: int = 100) -> list[uuid.UUID] | None:
    return await _search_ids(PROPERTIES_INDEX, query, ["name^3", "description"], limit)


async def search_vehicle_ids(query: str, limit: int = 100) -> list[uuid.UUID] | None:
    return await _search_ids(VEHICLES_INDEX, query, ["make^2", "model^2", "description", "vehicle_type"], limit)
