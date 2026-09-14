"""One-off: seed a large batch of realistic-looking dummy data across every
browsable module (tours, stays, vehicles, expert/host public profiles) plus
known-password demo accounts for every role, so the live site has real content
to browse instead of empty states.

Downloads ~100 real, royalty-free travel photos from Picsum Photos (Unsplash-
sourced, licensed for any use including commercial, no attribution required —
see https://picsum.photos/faq) and uploads them into the existing R2 bucket
through the same storage module the app itself uses.

Safe-ish to re-run: reuses existing demo-* users and locations, but creates a
fresh batch of tours/properties/vehicles each time (new slugs). Not meant to
be run twice in normal operation.

    python scripts/seed_demo_data.py
"""
import asyncio
import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.core import storage  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.locations.models import Location, LocationTag, TaggableEntityType  # noqa: E402
from app.modules.guides.models import (  # noqa: E402
    AssignmentStatus,
    GuideAssignment,
    GuideSupervision,
    SupervisionStatus,
)
from app.modules.profiles.models import HostProfile, LocalExpertProfile  # noqa: E402
from app.modules.rentcar.models import TransmissionType, Vehicle, VehicleStatus, VehicleType  # noqa: E402
from app.modules.stays.models import (  # noqa: E402
    AmenityKey,
    Property,
    PropertyAmenity,
    PropertyImage,
    PropertyStatus,
    PropertyType,
    RoomType,
)
from app.modules.tours.models import (  # noqa: E402
    Tour,
    TourDeparture,
    TourImage,
    TourItineraryDay,
    TourStatus,
)
from app.modules.users.models import (  # noqa: E402
    PartnerAccount,
    PartnerRole,
    PartnerRoleStatus,
    PartnerRoleType,
    SystemRole,
    User,
)

DEMO_PASSWORD = "OvigoDemo@2026"

# --- Photos -----------------------------------------------------------------

PICSUM_CANDIDATE_IDS = list(range(1, 260))  # more than we need; some ids 404, skip and keep going


async def download_photos(count: int) -> list[bytes]:
    photos: list[bytes] = []
    ids = PICSUM_CANDIDATE_IDS[:]
    random.Random(42).shuffle(ids)
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for pid in ids:
            if len(photos) >= count:
                break
            try:
                resp = await client.get(f"https://picsum.photos/id/{pid}/1200/800")
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                    photos.append(resp.content)
            except httpx.HTTPError:
                continue
    print(f"Downloaded {len(photos)} photos")
    return photos


def upload_image(prefix: str, data: bytes) -> tuple[str, str, str]:
    key = storage.build_key(prefix, "photo.jpg")
    storage.upload_bytes(key, data, "image/jpeg")
    return key, "image/jpeg", "photo.jpg"


# --- Generic helpers ----------------------------------------------------------


async def get_or_create_user(db, email: str, full_name: str, system_role: SystemRole = SystemRole.TRAVELER) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(DEMO_PASSWORD),
            system_role=system_role,
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        await db.flush()
    else:
        user.password_hash = hash_password(DEMO_PASSWORD)
        if system_role != SystemRole.TRAVELER:
            user.system_role = system_role
    return user


async def get_or_create_partner_role(db, user: User, role_type: PartnerRoleType) -> PartnerRole:
    result = await db.execute(select(PartnerAccount).where(PartnerAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if account is None:
        account = PartnerAccount(user_id=user.id)
        db.add(account)
        await db.flush()

    result = await db.execute(
        select(PartnerRole).where(PartnerRole.partner_account_id == account.id, PartnerRole.role_type == role_type)
    )
    role = result.scalar_one_or_none()
    if role is None:
        role = PartnerRole(partner_account_id=account.id, role_type=role_type, status=PartnerRoleStatus.APPROVED)
        db.add(role)
        await db.flush()
    elif role.status != PartnerRoleStatus.APPROVED:
        role.status = PartnerRoleStatus.APPROVED
    return role


async def tag_location(db, entity_type: TaggableEntityType, entity_id: uuid.UUID, location_id: uuid.UUID) -> None:
    result = await db.execute(
        select(LocationTag).where(
            LocationTag.entity_type == entity_type,
            LocationTag.entity_id == entity_id,
            LocationTag.location_id == location_id,
        )
    )
    if result.scalar_one_or_none() is None:
        db.add(LocationTag(entity_type=entity_type, entity_id=entity_id, location_id=location_id))


async def get_location(db, slug: str) -> Location:
    result = await db.execute(select(Location).where(Location.slug == slug))
    loc = result.scalar_one_or_none()
    if loc is None:
        raise RuntimeError(f"Location not found: {slug}")
    return loc


# --- Content templates --------------------------------------------------------

EXPERTS = [
    {"email": "demo-expert@ovigo-demo.com", "name": "Rahim Chowdhury", "headline": "Cox's Bazar & Southeast beach specialist"},
    {"email": "seed-expert-1@ovigo-demo.com", "name": "Nusrat Jahan", "headline": "Sundarbans wildlife & river tour guide"},
    {"email": "seed-expert-2@ovigo-demo.com", "name": "Arif Hossain", "headline": "Dhaka heritage & city walking tours"},
    {"email": "seed-expert-3@ovigo-demo.com", "name": "Priya Sharma", "headline": "Kolkata & Darjeeling hill tours"},
    {"email": "seed-expert-4@ovigo-demo.com", "name": "Somchai Suk", "headline": "Bangkok & Phuket island hopping"},
]

TOURS = [
    {"expert": 0, "loc": "coxs-bazar", "title": "Cox's Bazar Beach Escape", "days": 3, "price": 18500, "desc": "Relax on the world's longest natural sea beach with sunrise walks, fresh seafood, and a Himchari waterfall side trip."},
    {"expert": 0, "loc": "coxs-bazar", "title": "Cox's Bazar & Saint Martin's Island", "days": 4, "price": 26500, "desc": "Beach days in Cox's Bazar followed by a boat crossing to the coral island of Saint Martin's."},
    {"expert": 0, "loc": "coxs-bazar", "title": "Inani Beach Weekend Getaway", "days": 2, "price": 12500, "desc": "A short weekend trip to the quieter stretch of Inani Beach, with a local seafood dinner included."},
    {"expert": 1, "loc": "sundarbans", "title": "Sundarbans Mangrove Safari", "days": 4, "price": 32000, "desc": "A river cruise through the world's largest mangrove forest, tracking wildlife including the Royal Bengal Tiger's territory."},
    {"expert": 1, "loc": "sundarbans", "title": "Sundarbans Sunrise River Cruise", "days": 3, "price": 24000, "desc": "A shorter Sundarbans itinerary focused on sunrise boat rides and village visits along the delta."},
    {"expert": 2, "loc": "dhaka", "title": "Old Dhaka Heritage Walk", "days": 1, "price": 4500, "desc": "A full-day walking tour through Old Dhaka's Mughal-era forts, rickshaw-packed lanes, and street food stalls."},
    {"expert": 2, "loc": "dhaka", "title": "Dhaka City & River Cruise Combo", "days": 2, "price": 9500, "desc": "City sightseeing paired with a sunset cruise on the Buriganga River."},
    {"expert": 2, "loc": "chittagong", "title": "Chittagong Hill Tracts Adventure", "days": 5, "price": 35000, "desc": "Trekking and tribal village visits through the forested hills of Rangamati and Bandarban."},
    {"expert": 2, "loc": "chittagong", "title": "Chittagong Port City & Patenga Beach", "days": 2, "price": 11000, "desc": "A relaxed city and beach combo covering Chittagong's port history and Patenga's sunset views."},
    {"expert": 3, "loc": "kolkata", "title": "Kolkata Colonial Heritage Tour", "days": 3, "price": 21000, "desc": "Victoria Memorial, College Street, and the tram-lined streets of colonial Kolkata."},
    {"expert": 3, "loc": "kolkata", "title": "Kolkata Food & Culture Trail", "days": 2, "price": 14000, "desc": "A street-food-focused tour through Kolkata's most iconic neighborhoods and markets."},
    {"expert": 3, "loc": "darjeeling", "title": "Darjeeling Tea Garden Retreat", "days": 4, "price": 29500, "desc": "Toy train rides, tea estate tours, and sunrise views of Kangchenjunga from Tiger Hill."},
    {"expert": 4, "loc": "bangkok", "title": "Bangkok Temples & Night Markets", "days": 3, "price": 27500, "desc": "Grand Palace, Wat Arun, and the best of Bangkok's floating and night markets."},
    {"expert": 4, "loc": "phuket", "title": "Phuket Beach & Island Hopping", "days": 4, "price": 33000, "desc": "Patong Beach relaxation with a speedboat day trip to the Phi Phi Islands."},
    {"expert": 4, "loc": "phi-phi-islands", "title": "Phi Phi Islands Snorkeling Escape", "days": 2, "price": 19500, "desc": "Two days of snorkeling, cliff-jumping, and beach camping on the Phi Phi Islands."},
]

HOSTS = [
    {"email": "demo-host@ovigo-demo.com", "name": "Farida Yasmin", "business": "Sea Pearl Beach Resort"},
    {"email": "seed-host-1@ovigo-demo.com", "name": "Kamal Uddin", "business": "Dhaka Grand Suites"},
    {"email": "seed-host-2@ovigo-demo.com", "name": "Anika Rahman", "business": "Sundarban Eco Lodge"},
    {"email": "seed-host-3@ovigo-demo.com", "name": "Debashish Roy", "business": "Kolkata Heritage Inn"},
    {"email": "seed-host-4@ovigo-demo.com", "name": "Ploy Wattana", "business": "Andaman Bay Villas"},
]

PROPERTIES = [
    {"host": 0, "loc": "coxs-bazar", "name": "Sea Pearl Beach Resort", "type": PropertyType.RESORT, "desc": "Beachfront resort with direct sea access and an infinity pool overlooking Cox's Bazar."},
    {"host": 0, "loc": "coxs-bazar", "name": "Sea Pearl Residences", "type": PropertyType.HOMESTAY, "desc": "Quiet family-run homestay two minutes' walk from Laboni Beach."},
    {"host": 0, "loc": "coxs-bazar", "name": "Sea Pearl Budget Inn", "type": PropertyType.GUESTHOUSE, "desc": "Affordable guesthouse rooms close to the main beach entrance."},
    {"host": 1, "loc": "dhaka", "name": "Dhaka Grand Suites", "type": PropertyType.HOTEL, "desc": "Business hotel in Gulshan with rooftop dining and airport transfers."},
    {"host": 1, "loc": "dhaka", "name": "Dhaka Grand Residency", "type": PropertyType.HOTEL, "desc": "Extended-stay serviced apartments near Dhanmondi Lake."},
    {"host": 1, "loc": "chittagong", "name": "Dhaka Grand Chattogram", "type": PropertyType.HOTEL, "desc": "A sister property in Chittagong's commercial district."},
    {"host": 2, "loc": "sundarbans", "name": "Sundarban Eco Lodge", "type": PropertyType.HOMESTAY, "desc": "Riverside eco-cabins on the edge of the mangrove forest, with guided boat tours."},
    {"host": 3, "loc": "kolkata", "name": "Kolkata Heritage Inn", "type": PropertyType.HOTEL, "desc": "A restored colonial-era mansion converted into a boutique hotel near Park Street."},
    {"host": 3, "loc": "kolkata", "name": "Kolkata Heritage Annex", "type": PropertyType.GUESTHOUSE, "desc": "A quieter annex property a short walk from the main heritage building."},
    {"host": 3, "loc": "darjeeling", "name": "Darjeeling Heritage Cottage", "type": PropertyType.HOMESTAY, "desc": "A hillside cottage with private tea-garden views."},
    {"host": 4, "loc": "phuket", "name": "Andaman Bay Villas", "type": PropertyType.RESORT, "desc": "Private pool villas a short walk from Patong Beach."},
    {"host": 4, "loc": "phuket", "name": "Andaman Bay Suites", "type": PropertyType.HOTEL, "desc": "Mid-range suites with a rooftop bar and airport shuttle."},
    {"host": 4, "loc": "bangkok", "name": "Andaman Bangkok Riverside", "type": PropertyType.HOTEL, "desc": "A riverside hotel with easy boat access to Bangkok's main temples."},
    {"host": 4, "loc": "phi-phi-islands", "name": "Phi Phi Bay Bungalows", "type": PropertyType.GUESTHOUSE, "desc": "Simple beachfront bungalows steps from the main pier."},
    {"host": 2, "loc": "chittagong", "name": "Sundarban Gateway Lodge", "type": PropertyType.GUESTHOUSE, "desc": "A convenient stopover lodge for travelers heading into the Sundarbans."},
]

RENTCARS = [
    {"email": "demo-rentcar@ovigo-demo.com", "name": "Jasim Khan", "business": "Dhaka Wheels"},
    {"email": "seed-rentcar-1@ovigo-demo.com", "name": "Selim Reza", "business": "Chittagong Auto Rentals"},
    {"email": "seed-rentcar-2@ovigo-demo.com", "name": "Tania Ferdous", "business": "Cox's Bazar Ride Hub"},
    {"email": "seed-rentcar-3@ovigo-demo.com", "name": "Rohan Das", "business": "Kolkata Car Point"},
    {"email": "seed-rentcar-4@ovigo-demo.com", "name": "Niran Boon", "business": "Bangkok City Rentals"},
]

VEHICLES = [
    {"rentcar": 0, "loc": "dhaka", "make": "Toyota", "model": "Corolla Axio", "year": 2022, "type": VehicleType.SEDAN, "trans": TransmissionType.AUTOMATIC, "seats": 4, "price": 3500},
    {"rentcar": 0, "loc": "dhaka", "make": "Toyota", "model": "Noah", "year": 2021, "type": VehicleType.VAN, "trans": TransmissionType.AUTOMATIC, "seats": 7, "price": 5500},
    {"rentcar": 0, "loc": "dhaka", "make": "Honda", "model": "CR-V", "year": 2023, "type": VehicleType.SUV, "trans": TransmissionType.AUTOMATIC, "seats": 5, "price": 6500},
    {"rentcar": 0, "loc": "dhaka", "make": "Hiace", "model": "Grand Cabin", "year": 2020, "type": VehicleType.MICROBUS, "trans": TransmissionType.MANUAL, "seats": 12, "price": 7500},
    {"rentcar": 0, "loc": "dhaka", "make": "Bajaj", "model": "Pulsar 150", "year": 2023, "type": VehicleType.MOTORCYCLE, "trans": TransmissionType.MANUAL, "seats": 2, "price": 1200},
    {"rentcar": 0, "loc": "dhaka", "make": "Toyota", "model": "Premio", "year": 2022, "type": VehicleType.SEDAN, "trans": TransmissionType.AUTOMATIC, "seats": 4, "price": 3800},
    {"rentcar": 1, "loc": "chittagong", "make": "Mitsubishi", "model": "Pajero", "year": 2021, "type": VehicleType.SUV, "trans": TransmissionType.AUTOMATIC, "seats": 5, "price": 7000},
    {"rentcar": 1, "loc": "chittagong", "make": "Toyota", "model": "Hilux", "year": 2020, "type": VehicleType.PICKUP, "trans": TransmissionType.MANUAL, "seats": 4, "price": 5000},
    {"rentcar": 1, "loc": "chittagong", "make": "Toyota", "model": "Allion", "year": 2022, "type": VehicleType.SEDAN, "trans": TransmissionType.AUTOMATIC, "seats": 4, "price": 3600},
    {"rentcar": 1, "loc": "chittagong", "make": "Nissan", "model": "Caravan", "year": 2019, "type": VehicleType.MICROBUS, "trans": TransmissionType.MANUAL, "seats": 12, "price": 7200},
    {"rentcar": 2, "loc": "coxs-bazar", "make": "Toyota", "model": "Axio", "year": 2021, "type": VehicleType.SEDAN, "trans": TransmissionType.AUTOMATIC, "seats": 4, "price": 3400},
    {"rentcar": 2, "loc": "coxs-bazar", "make": "Suzuki", "model": "Every Van", "year": 2020, "type": VehicleType.VAN, "trans": TransmissionType.MANUAL, "seats": 7, "price": 4800},
    {"rentcar": 2, "loc": "coxs-bazar", "make": "Yamaha", "model": "FZS", "year": 2023, "type": VehicleType.MOTORCYCLE, "trans": TransmissionType.MANUAL, "seats": 2, "price": 1100},
    {"rentcar": 2, "loc": "coxs-bazar", "make": "Toyota", "model": "Hiace", "year": 2021, "type": VehicleType.MICROBUS, "trans": TransmissionType.AUTOMATIC, "seats": 12, "price": 8000},
    {"rentcar": 3, "loc": "kolkata", "make": "Maruti Suzuki", "model": "Dzire", "year": 2022, "type": VehicleType.SEDAN, "trans": TransmissionType.MANUAL, "seats": 4, "price": 2800},
    {"rentcar": 3, "loc": "kolkata", "make": "Mahindra", "model": "Scorpio", "year": 2021, "type": VehicleType.SUV, "trans": TransmissionType.MANUAL, "seats": 7, "price": 4200},
    {"rentcar": 4, "loc": "bangkok", "make": "Toyota", "model": "Camry", "year": 2023, "type": VehicleType.SEDAN, "trans": TransmissionType.AUTOMATIC, "seats": 4, "price": 4500},
    {"rentcar": 4, "loc": "bangkok", "make": "Toyota", "model": "Commuter Van", "year": 2022, "type": VehicleType.VAN, "trans": TransmissionType.AUTOMATIC, "seats": 10, "price": 6800},
    {"rentcar": 4, "loc": "bangkok", "make": "Honda", "model": "PCX 150", "year": 2023, "type": VehicleType.MOTORCYCLE, "trans": TransmissionType.AUTOMATIC, "seats": 2, "price": 1000},
    {"rentcar": 4, "loc": "bangkok", "make": "Isuzu", "model": "D-Max", "year": 2021, "type": VehicleType.PICKUP, "trans": TransmissionType.MANUAL, "seats": 4, "price": 4600},
]

AMENITY_SETS = [
    [AmenityKey.WIFI, AmenityKey.AC, AmenityKey.HOT_WATER],
    [AmenityKey.WIFI, AmenityKey.POOL, AmenityKey.BREAKFAST_INCLUDED, AmenityKey.AC],
    [AmenityKey.WIFI, AmenityKey.PARKING, AmenityKey.AIRPORT_PICKUP],
    [AmenityKey.WIFI, AmenityKey.KITCHEN, AmenityKey.PET_FRIENDLY],
]


async def main() -> None:
    photos = await download_photos(100)
    if len(photos) < 20:
        print("Not enough photos downloaded — aborting before touching the database.")
        return

    tour_photos = photos[0:45]
    property_photos = photos[45:90]
    profile_photos = photos[90:100]

    async with AsyncSessionLocal() as db:
        # --- Demo role accounts (known password, all roles) ---
        await get_or_create_user(db, "demo-superadmin@ovigo-demo.com", "Ovigo Super Admin", SystemRole.SUPER_ADMIN)
        await get_or_create_user(db, "demo-admin@ovigo-demo.com", "Ovigo Admin", SystemRole.ADMIN)
        await get_or_create_user(db, "demo-traveler@ovigo-demo.com", "Demo Traveler")
        await get_or_create_user(db, "demo-traveler2@ovigo-demo.com", "Demo Traveler Two")

        # --- Local Experts + tours ---
        expert_roles: list[PartnerRole] = []
        for i, e in enumerate(EXPERTS):
            user = await get_or_create_user(db, e["email"], e["name"])
            role = await get_or_create_partner_role(db, user, PartnerRoleType.LOCAL_EXPERT)
            expert_roles.append(role)

            result = await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
            profile = result.scalar_one_or_none()
            if profile is None:
                profile = LocalExpertProfile(partner_role_id=role.id)
                db.add(profile)
            profile.headline = e["headline"]
            profile.bio = f"{e['name']} has been guiding travelers for years, specializing in {e['headline'].lower()}."
            profile.years_experience = random.randint(3, 12)
            profile.languages = ["English", "Bengali"]
            profile.is_published = True
            key, ctype, fname = upload_image("profiles/expert", profile_photos[i])
            profile.photo_key, profile.photo_content_type = key, ctype

            first_tour_loc = next((t["loc"] for t in TOURS if t["expert"] == i), "bangladesh")
            loc = await get_location(db, first_tour_loc)
            await tag_location(db, TaggableEntityType.PARTNER_ROLE, role.id, loc.id)

        await db.flush()

        tour_img_cursor = 0
        for t in TOURS:
            role = expert_roles[t["expert"]]
            loc = await get_location(db, t["loc"])
            slug = f"{t['title'].lower().replace(chr(39), '').replace(' ', '-').replace('&', 'and')}-{uuid.uuid4().hex[:6]}"
            tour = Tour(
                local_expert_role_id=role.id,
                title=t["title"],
                slug=slug,
                description=t["desc"],
                duration_days=t["days"],
                base_price=Decimal(str(t["price"])),
                max_group_size=random.choice([8, 10, 12, 15]),
                status=TourStatus.PUBLISHED,
            )
            db.add(tour)
            await db.flush()

            db.add(TourItineraryDay(tour_id=tour.id, day_number=1, title="Arrival & orientation", description="Arrival, hotel check-in, and an evening welcome briefing."))
            if t["days"] > 1:
                db.add(TourItineraryDay(tour_id=tour.id, day_number=2, title="Main excursion", description="The tour's signature sightseeing day."))
            if t["days"] > 2:
                db.add(TourItineraryDay(tour_id=tour.id, day_number=t["days"], title="Departure", description="Final morning at leisure before departure transfer."))

            today = date.today()
            for offset in (14, 30, 45):
                db.add(TourDeparture(tour_id=tour.id, departure_date=today + timedelta(days=offset), available_seats=random.randint(4, 12)))

            for sort_order in range(3):
                photo = tour_photos[tour_img_cursor % len(tour_photos)]
                tour_img_cursor += 1
                key, ctype, fname = upload_image("tours", photo)
                db.add(TourImage(tour_id=tour.id, storage_key=key, content_type=ctype, file_name=fname, sort_order=sort_order))

            await tag_location(db, TaggableEntityType.TOUR, tour.id, loc.id)

        # Leave one tour PENDING_REVIEW so the admin approval queue has something in it.
        await db.flush()
        result = await db.execute(select(Tour).where(Tour.status == TourStatus.PUBLISHED).limit(1))
        sample_tour = result.scalar_one_or_none()
        if sample_tour:
            sample_tour.status = TourStatus.PENDING_REVIEW

        print(f"Created {len(TOURS)} tours")

        # --- Hosts + properties ---
        host_roles: list[PartnerRole] = []
        for i, h in enumerate(HOSTS):
            user = await get_or_create_user(db, h["email"], h["name"])
            role = await get_or_create_partner_role(db, user, PartnerRoleType.HOST)
            host_roles.append(role)

            result = await db.execute(select(HostProfile).where(HostProfile.partner_role_id == role.id))
            profile = result.scalar_one_or_none()
            if profile is None:
                profile = HostProfile(partner_role_id=role.id)
                db.add(profile)
            profile.business_name = h["business"]
            profile.bio = f"{h['business']} is a family-run hospitality business hosted by {h['name']}."
            profile.is_published = True
            key, ctype, fname = upload_image("profiles/host", profile_photos[5 + i] if 5 + i < len(profile_photos) else profile_photos[i])
            profile.photo_key, profile.photo_content_type = key, ctype

            first_prop_loc = next((p["loc"] for p in PROPERTIES if p["host"] == i), "bangladesh")
            loc = await get_location(db, first_prop_loc)
            await tag_location(db, TaggableEntityType.PARTNER_ROLE, role.id, loc.id)

        await db.flush()

        prop_img_cursor = 0
        for p in PROPERTIES:
            role = host_roles[p["host"]]
            loc = await get_location(db, p["loc"])
            slug = f"{p['name'].lower().replace(chr(39), '').replace(' ', '-')}-{uuid.uuid4().hex[:6]}"
            prop = Property(
                host_role_id=role.id,
                name=p["name"],
                slug=slug,
                description=p["desc"],
                property_type=p["type"],
                status=PropertyStatus.PUBLISHED,
                check_in_time="14:00",
                check_out_time="12:00",
                cancellation_policy="Free cancellation up to 48 hours before check-in.",
                house_rules="No smoking indoors. Quiet hours after 10pm.",
            )
            db.add(prop)
            await db.flush()

            base = Decimal(str(random.choice([3500, 5500, 8000, 12000])))
            db.add(RoomType(property_id=prop.id, name="Standard Room", max_occupancy=2, base_price=base, total_units=random.randint(3, 10)))
            db.add(RoomType(property_id=prop.id, name="Deluxe Room", max_occupancy=3, base_price=base + 2500, total_units=random.randint(2, 6)))

            for amenity in random.choice(AMENITY_SETS):
                db.add(PropertyAmenity(property_id=prop.id, amenity=amenity))

            for sort_order in range(3):
                photo = property_photos[prop_img_cursor % len(property_photos)]
                prop_img_cursor += 1
                key, ctype, fname = upload_image("properties", photo)
                db.add(PropertyImage(property_id=prop.id, storage_key=key, content_type=ctype, file_name=fname, sort_order=sort_order))

            await tag_location(db, TaggableEntityType.PROPERTY, prop.id, loc.id)

        await db.flush()
        result = await db.execute(select(Property).where(Property.status == PropertyStatus.PUBLISHED).limit(1))
        sample_property = result.scalar_one_or_none()
        if sample_property:
            sample_property.status = PropertyStatus.PENDING_REVIEW

        print(f"Created {len(PROPERTIES)} properties")

        # --- Rent-a-Car partners + vehicles ---
        rentcar_roles: list[PartnerRole] = []
        for r in RENTCARS:
            user = await get_or_create_user(db, r["email"], r["name"])
            role = await get_or_create_partner_role(db, user, PartnerRoleType.RENT_A_CAR)
            rentcar_roles.append(role)
            first_veh_loc = next((v["loc"] for v in VEHICLES if v["rentcar"] == RENTCARS.index(r)), "bangladesh")
            loc = await get_location(db, first_veh_loc)
            await tag_location(db, TaggableEntityType.PARTNER_ROLE, role.id, loc.id)

        await db.flush()

        for v in VEHICLES:
            role = rentcar_roles[v["rentcar"]]
            loc = await get_location(db, v["loc"])
            vehicle = Vehicle(
                rent_a_car_role_id=role.id,
                make=v["make"],
                model=v["model"],
                year=v["year"],
                vehicle_type=v["type"],
                transmission=v["trans"],
                seats=v["seats"],
                price_per_day=Decimal(str(v["price"])),
                with_driver=random.choice([True, False]),
                description=f"A well-maintained {v['year']} {v['make']} {v['model']}, available for daily rental.",
                status=VehicleStatus.PUBLISHED,
            )
            db.add(vehicle)
            await db.flush()
            await tag_location(db, TaggableEntityType.VEHICLE, vehicle.id, loc.id)

        await db.flush()
        result = await db.execute(select(Vehicle).where(Vehicle.status == VehicleStatus.PUBLISHED).limit(1))
        sample_vehicle = result.scalar_one_or_none()
        if sample_vehicle:
            sample_vehicle.status = VehicleStatus.PENDING_REVIEW

        print(f"Created {len(VEHICLES)} vehicles")

        # --- Guide: supervised by the first demo expert, assigned to one departure ---
        guide_user = await get_or_create_user(db, "demo-guide@ovigo-demo.com", "Demo Guide")
        guide_role = await get_or_create_partner_role(db, guide_user, PartnerRoleType.GUIDE)

        result = await db.execute(
            select(GuideSupervision).where(GuideSupervision.guide_role_id == guide_role.id)
        )
        supervision = result.scalar_one_or_none()
        if supervision is None:
            supervision = GuideSupervision(
                local_expert_role_id=expert_roles[0].id,
                guide_role_id=guide_role.id,
                status=SupervisionStatus.ACCEPTED,
            )
            db.add(supervision)
            await db.flush()

        result = await db.execute(
            select(TourDeparture)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Tour.local_expert_role_id == expert_roles[0].id)
            .limit(1)
        )
        departure = result.scalar_one_or_none()
        if departure:
            result = await db.execute(select(GuideAssignment).where(GuideAssignment.guide_role_id == guide_role.id))
            if result.scalar_one_or_none() is None:
                db.add(
                    GuideAssignment(
                        guide_role_id=guide_role.id,
                        tour_departure_id=departure.id,
                        assigned_by_role_id=expert_roles[0].id,
                        fee_amount=Decimal("2500.00"),
                        status=AssignmentStatus.ASSIGNED,
                    )
                )

        await db.commit()
        print("Seed data committed.")


if __name__ == "__main__":
    asyncio.run(main())
