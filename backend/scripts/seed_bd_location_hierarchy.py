"""Seeds Bangladesh's real administrative hierarchy (Division -> District -> Upazila)
under the existing "Bangladesh" country row, then re-parents the handful of existing
Bangladesh-side locations (Dhaka, Chittagong cities; Cox's Bazar, Sundarbans
attractions) onto the correct new node — by ID, so no LocationTag rows need to change.

Scope: all 8 divisions and all 64 districts are seeded (complete, correct reference
data — cheap and unlocks nationwide location search immediately). Upazilas are only
seeded where real content exists today or for a handful of well-known tourist spots,
not all ~495 nationally; more can be added later via the existing admin locations CRUD
(POST/PUT /api/v1/locations) as real listings need them.

Re-run safe: every insert checks for an existing slug first.

    python scripts/seed_bd_location_hierarchy.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.locations.models import Location, LocationType  # noqa: E402

# division_name -> [district names]
DIVISIONS: dict[str, list[str]] = {
    "Dhaka": [
        "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur",
        "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur",
        "Tangail",
    ],
    "Chittagong": [
        "Bandarban", "Brahmanbaria", "Chandpur", "Chittagong", "Comilla", "Cox's Bazar",
        "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
    ],
    "Rajshahi": [
        "Bogura", "Joypurhat", "Naogaon", "Natore", "Chapainawabganj", "Pabna",
        "Rajshahi", "Sirajganj",
    ],
    "Khulna": [
        "Bagerhat", "Chuadanga", "Jessore", "Jhenaidah", "Khulna", "Kushtia", "Magura",
        "Meherpur", "Narail", "Satkhira",
    ],
    "Barisal": ["Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
    "Sylhet": ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
    "Rangpur": [
        "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh",
        "Rangpur", "Thakurgaon",
    ],
    "Mymensingh": ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
}

# Upazilas worth seeding now: (district_name, upazila_name)
UPAZILAS: list[tuple[str, str]] = [
    ("Cox's Bazar", "Cox's Bazar Sadar"),
    ("Bagerhat", "Mongla"),
    ("Moulvibazar", "Sreemangal"),
    ("Bandarban", "Bandarban Sadar"),
    ("Rangamati", "Rangamati Sadar"),
    ("Sylhet", "Sylhet Sadar"),
]

# (existing_slug, new_parent_upazila_name) — re-parent existing rows by slug, not by
# recreating them, so every LocationTag pointing at these IDs keeps working untouched.
REPARENT_TO_UPAZILA: list[tuple[str, str]] = [
    ("coxs-bazar", "Cox's Bazar Sadar"),
    ("sundarbans", "Mongla"),
]

# (existing_slug, new_parent_district_name) — Dhaka/Chittagong city corporation areas
# have no upazila layer in real Bangladesh geography (see locations/models.py docstring).
REPARENT_TO_DISTRICT: list[tuple[str, str]] = [
    ("dhaka", "Dhaka"),
    ("chittagong", "Chittagong"),
]


def slugify(name: str) -> str:
    return name.lower().replace("'", "").replace(" ", "-")


async def get_or_create(db, name: str, type_: LocationType, parent_id) -> Location:
    slug = slugify(name)
    existing = (await db.execute(select(Location).where(Location.slug == slug))).scalar_one_or_none()
    if existing:
        return existing
    loc = Location(name=name, slug=slug, type=type_, parent_id=parent_id)
    db.add(loc)
    await db.flush()
    return loc


async def main() -> None:
    async with AsyncSessionLocal() as db:
        bangladesh = (await db.execute(select(Location).where(Location.slug == "bangladesh"))).scalar_one_or_none()
        if not bangladesh:
            print("ERROR: no 'bangladesh' country location found — seed the base countries first.")
            return

        districts_by_name: dict[str, Location] = {}
        division_count = 0
        district_count = 0
        for division_name, district_names in DIVISIONS.items():
            # "Division"/"District" suffixes avoid slug collisions with existing
            # same-named CITY/ATTRACTION rows (e.g. the "Chittagong" city already
            # has slug "chittagong" — the division needs a distinct slug).
            division = await get_or_create(db, f"{division_name} Division", LocationType.DIVISION, bangladesh.id)
            division_count += 1
            for district_name in district_names:
                district = await get_or_create(db, f"{district_name} District", LocationType.DISTRICT, division.id)
                districts_by_name[district_name] = district
                district_count += 1

        upazila_count = 0
        upazilas_by_name: dict[str, Location] = {}
        for district_name, upazila_name in UPAZILAS:
            district = districts_by_name.get(district_name)
            if not district:
                print(f"WARNING: district '{district_name}' not found for upazila '{upazila_name}', skipping")
                continue
            upazila = await get_or_create(db, upazila_name, LocationType.UPAZILA, district.id)
            upazilas_by_name[upazila_name] = upazila
            upazila_count += 1

        reparented = 0
        for slug, upazila_name in REPARENT_TO_UPAZILA:
            existing = (await db.execute(select(Location).where(Location.slug == slug))).scalar_one_or_none()
            upazila = upazilas_by_name.get(upazila_name)
            if existing and upazila and existing.parent_id != upazila.id:
                existing.parent_id = upazila.id
                reparented += 1
                print(f"Re-parented '{existing.name}' -> under '{upazila.name}' (upazila)")

        for slug, district_name in REPARENT_TO_DISTRICT:
            existing = (await db.execute(select(Location).where(Location.slug == slug))).scalar_one_or_none()
            district = districts_by_name.get(district_name)
            if existing and district and existing.parent_id != district.id:
                existing.parent_id = district.id
                reparented += 1
                print(f"Re-parented '{existing.name}' -> under '{district.name}' (district)")

        await db.commit()
        print(
            f"\nDone. Divisions: {division_count}, Districts: {district_count}, "
            f"Upazilas: {upazila_count}, Re-parented: {reparented}"
        )


asyncio.run(main())
