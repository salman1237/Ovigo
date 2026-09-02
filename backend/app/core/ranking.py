"""Shared composite search-ranking formula (technical document Sprint 21-22:
"Smart search ranking algorithm ... relevance, rating, conversion, completeness"),
used by tours/service.py, stays' search_stays, rentcar/service.py, and
search/service.py's expert search so every listing surface ranks the same way.

No free-text query exists anywhere in this codebase — search is location-tag +
date filtered only (see search/service.py) — so "relevance" here means how
specifically a listing matches the searched location: tagged directly to the exact
location searched (1.0) vs. only reachable via subtree inheritance from a broader
ancestor (0.5), vs. no location filter applied at all (0.5, neutral — nothing to be
relevant to). `resolve_slug_to_subtree_ids` already returns the searched location's
own id first followed by its descendants', so callers pass that same list through
and this module treats index 0 as "exact."

`rating` is None (not 0) for a listing type/instance with no review data — e.g. every
Vehicle, since `Review` has no `vehicle_id` column in this schema, or a specific tour
with zero reviews yet. None is scored as a neutral 0.5 rather than penalizing a
brand-new or unreviewable listing down to the bottom of the results.

`conversion` (a listing's completed-booking count) is normalized via
`count / (count + CONVERSION_SMOOTHING)` rather than dividing by the current result
set's maximum — this keeps one high-volume listing from collapsing everyone else's
conversion score toward zero, and needs no second query to find that maximum.

Weights below are a starting judgment call, not tuned against real usage data —
there's no click/booking-attribution telemetry yet to tune against (the same gap
already noted for ad ROAS elsewhere in this codebase). Relevance and rating are
weighted highest since they most directly reflect "will this traveler want this
result"; conversion and completeness are secondary trust signals.
"""
from dataclasses import dataclass

RELEVANCE_WEIGHT = 0.35
RATING_WEIGHT = 0.30
CONVERSION_WEIGHT = 0.20
COMPLETENESS_WEIGHT = 0.15
CONVERSION_SMOOTHING = 5


@dataclass
class RankingFactors:
    relevance: float  # 0..1
    rating: float | None  # 0..5, or None if this listing/type has no rating data
    conversion_count: int  # completed bookings for this specific listing
    completeness: float  # 0..1, fraction of tracked profile/listing fields filled in


def composite_score(factors: RankingFactors) -> float:
    # Postgres AVG() over an integer column returns a Decimal, not a float — normalize
    # here so callers can pass whatever their aggregate query handed back.
    rating_component = (float(factors.rating) / 5) if factors.rating is not None else 0.5
    conversion_component = factors.conversion_count / (factors.conversion_count + CONVERSION_SMOOTHING)
    return (
        RELEVANCE_WEIGHT * factors.relevance
        + RATING_WEIGHT * rating_component
        + CONVERSION_WEIGHT * conversion_component
        + COMPLETENESS_WEIGHT * factors.completeness
    )


def relevance_for(entity_id, location_ids: list | None, exact_match_ids: set) -> float:
    """`location_ids` is the full searched-subtree list (or None if no location filter
    was applied); `exact_match_ids` is the subset of a result set's entity ids tagged
    directly to `location_ids[0]` (the exact location searched, not a descendant)."""
    if not location_ids:
        return 0.5
    return 1.0 if entity_id in exact_match_ids else 0.5
