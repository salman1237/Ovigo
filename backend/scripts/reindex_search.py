"""One-time backfill: index every currently-PUBLISHED tour/property/vehicle into
Elasticsearch. Needed once for listings that were published before the free-text
search feature existed — everything published after runs through the incremental
indexing hooks in admin/service.py and each module's update_* instead. Safe to
re-run (indexing is an upsert by id).

    python scripts/reindex_search.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.core import search_engine  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.rentcar.models import Vehicle, VehicleStatus  # noqa: E402
from app.modules.stays.models import Property, PropertyStatus  # noqa: E402
from app.modules.tours.models import Tour, TourStatus  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tours = (await db.execute(select(Tour).where(Tour.status == TourStatus.PUBLISHED))).scalars().all()
        for tour in tours:
            await search_engine.index_tour(tour.id, tour.title, tour.description, tour.base_price)
        print(f"Indexed {len(tours)} published tour(s)")

        properties = (await db.execute(select(Property).where(Property.status == PropertyStatus.PUBLISHED))).scalars().all()
        for prop in properties:
            await search_engine.index_property(prop.id, prop.name, prop.description, prop.property_type.value)
        print(f"Indexed {len(properties)} published propertie(s)")

        vehicles = (await db.execute(select(Vehicle).where(Vehicle.status == VehicleStatus.PUBLISHED))).scalars().all()
        for vehicle in vehicles:
            await search_engine.index_vehicle(vehicle.id, vehicle.make, vehicle.model, vehicle.description, vehicle.vehicle_type.value)
        print(f"Indexed {len(vehicles)} published vehicle(s)")


asyncio.run(main())
