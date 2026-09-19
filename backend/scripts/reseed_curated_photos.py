"""One-off: replace the random Picsum photos on the Sprint 31-32 seed data
(seed_demo_data.py) with a hand-curated set — manually reviewed via a Playwright
contact-sheet screenshot to exclude anything not travel-appropriate (a coffee cup,
a lion's face, a dog, a dandelion-in-hand, a tuk-tuk license plate, etc. all made it
through the original blind-random selection and were visibly bad on the live
homepage). Scoped to exactly the 15 tours + 15 properties created in that seed run
(created_at on 2026-09-13) — leaves any earlier "Demo:" listings untouched.

    python scripts/reseed_curated_photos.py
"""
import asyncio
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.core import storage  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.stays.models import Property, PropertyImage  # noqa: E402
from app.modules.tours.models import Tour, TourImage  # noqa: E402

# Manually reviewed via a contact-sheet screenshot — every id here is a genuine
# landscape/city/beach/mountain/travel photo, nothing off-topic.
CURATED_IDS = [
    1036, 1043, 1044, 1045, 1050, 1053, 1057, 1076, 1081, 168, 177, 184, 194, 214,
    244, 249, 260, 268, 274, 280, 291, 293, 301, 314, 318, 335, 342, 351, 371, 380,
    392, 402, 411, 421, 442, 451, 481, 501, 512, 523, 542,
]

SEED_DAY_START = datetime(2026, 9, 13, tzinfo=timezone.utc)
SEED_DAY_END = datetime(2026, 9, 14, tzinfo=timezone.utc)


async def download_curated(client: httpx.AsyncClient) -> list[bytes]:
    photos = []
    for pid in CURATED_IDS:
        resp = await client.get(f"https://picsum.photos/id/{pid}/1200/800")
        if resp.status_code == 200:
            photos.append(resp.content)
    print(f"Downloaded {len(photos)}/{len(CURATED_IDS)} curated photos")
    return photos


def upload_image(prefix: str, data: bytes) -> tuple[str, str, str]:
    key = storage.build_key(prefix, "photo.jpg")
    storage.upload_bytes(key, data, "image/jpeg")
    return key, "image/jpeg", "photo.jpg"


def pick_three(rng: random.Random, pool_size: int) -> list[int]:
    """Three distinct indices where possible, so one listing's 3 photos aren't
    all the same curated image."""
    if pool_size >= 3:
        return rng.sample(range(pool_size), 3)
    return [rng.randrange(pool_size) for _ in range(3)]


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        photos = await download_curated(client)
    if len(photos) < 20:
        print("Not enough curated photos downloaded — aborting before touching the database.")
        return

    rng = random.Random(7)

    async with AsyncSessionLocal() as db:
        tours = (
            await db.execute(
                select(Tour)
                .where(Tour.created_at >= SEED_DAY_START, Tour.created_at < SEED_DAY_END)
                .options(selectinload(Tour.images))
            )
        ).scalars().all()
        properties = (
            await db.execute(
                select(Property)
                .where(Property.created_at >= SEED_DAY_START, Property.created_at < SEED_DAY_END)
                .options(selectinload(Property.images))
            )
        ).scalars().all()
        print(f"Found {len(tours)} tours, {len(properties)} properties to re-photo")

        old_keys: list[str] = []

        for tour in tours:
            old_keys.extend(img.storage_key for img in tour.images)
            for img in list(tour.images):
                await db.delete(img)
            await db.flush()
            for sort_order, idx in enumerate(pick_three(rng, len(photos))):
                key, ctype, fname = upload_image("tours", photos[idx])
                db.add(TourImage(tour_id=tour.id, storage_key=key, content_type=ctype, file_name=fname, sort_order=sort_order))

        for prop in properties:
            old_keys.extend(img.storage_key for img in prop.images)
            for img in list(prop.images):
                await db.delete(img)
            await db.flush()
            for sort_order, idx in enumerate(pick_three(rng, len(photos))):
                key, ctype, fname = upload_image("properties", photos[idx])
                db.add(PropertyImage(property_id=prop.id, storage_key=key, content_type=ctype, file_name=fname, sort_order=sort_order))

        await db.commit()
        print(f"Committed new images for {len(tours)} tours and {len(properties)} properties")

        for key in old_keys:
            storage.delete_object(key)
        print(f"Deleted {len(old_keys)} old R2 objects")


if __name__ == "__main__":
    asyncio.run(main())
