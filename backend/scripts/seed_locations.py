"""Seed a small starter location hierarchy (Country -> City -> Attraction) for local
testing and demos. Safe to re-run — skips locations that already exist by slug.

    python scripts/seed_locations.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.locations.models import Location, LocationType  # noqa: E402

SEED_DATA = [
    {"name": "Bangladesh", "slug": "bangladesh", "type": LocationType.COUNTRY, "parent_slug": None},
    {"name": "Dhaka", "slug": "dhaka", "type": LocationType.CITY, "parent_slug": "bangladesh"},
    {"name": "Chittagong", "slug": "chittagong", "type": LocationType.CITY, "parent_slug": "bangladesh"},
    {
        "name": "Cox's Bazar",
        "slug": "coxs-bazar",
        "type": LocationType.ATTRACTION,
        "parent_slug": "chittagong",
        "latitude": 21.4272,
        "longitude": 92.0058,
    },
    {
        "name": "Sundarbans",
        "slug": "sundarbans",
        "type": LocationType.ATTRACTION,
        "parent_slug": "bangladesh",
        "latitude": 21.9497,
        "longitude": 89.1833,
    },
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        slug_to_id = {}
        for entry in SEED_DATA:
            result = await db.execute(select(Location).where(Location.slug == entry["slug"]))
            existing = result.scalar_one_or_none()
            if existing:
                slug_to_id[entry["slug"]] = existing.id
                print(f"skip (exists): {entry['slug']}")
                continue

            location = Location(
                name=entry["name"],
                slug=entry["slug"],
                type=entry["type"],
                parent_id=slug_to_id.get(entry["parent_slug"]) if entry["parent_slug"] else None,
                latitude=entry.get("latitude"),
                longitude=entry.get("longitude"),
            )
            db.add(location)
            await db.flush()
            slug_to_id[entry["slug"]] = location.id
            print(f"created: {entry['slug']}")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
