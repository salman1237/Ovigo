# Ovigo PRD Audit — Sections 10 & 12
**Generated:** 2026-10-04  
**Scope:** PRD §10 (Local Expert Tour Listing System) + §12 (Expert Business and Service Network)  
**Status legend:** ✅ Complete · ⚠️ Partial · ❌ Missing

---

## Section 10 — LOCAL EXPERT TOUR LISTING SYSTEM

### 10.1 Supported Tour Types

All 14 PRD tour types are in the `TourType` enum (`backend/app/modules/tours/models.py`).

| PRD Type | Status |
|---|---|
| Fixed Departure Tour | ✅ |
| Private Tour | ✅ |
| Group Tour | ✅ |
| Ground Tour | ✅ |
| Day Tour | ✅ |
| Multi-Day Tour | ✅ |
| Local Experience | ✅ |
| Family Tour | ✅ |
| Couple Tour | ✅ |
| Adventure Tour | ✅ |
| Food Tour | ✅ |
| Photography Tour | ✅ |
| Cultural Tour | ✅ |
| Corporate or Team Tour | ✅ |

---

### 10.2 Fixed-Calendar Requirement

Handled by `TourDeparture` model.

| Field | Status | Notes |
|---|---|---|
| Departure date | ✅ | `TourDeparture.departure_date` |
| Return date | ✅ | `TourDeparture.return_date` |
| Booking deadline | ✅ | `TourDeparture.booking_deadline` |
| Minimum participants | ✅ | `TourDeparture.min_participants` |
| Maximum participants | ✅ | `TourDeparture.max_participants` |
| Remaining seats | ⚠️ | Not stored as a column; must be computed at query time from `max_participants − confirmed_booking_count`. No computed field or service helper exists yet. |
| Confirmation threshold | ✅ | `TourDeparture.confirmation_threshold` |
| Tour status | ✅ | `TourDeparture.status` |
| Departure time | ✅ | `TourDeparture.departure_time` |
| Return time | ✅ | `TourDeparture.return_time` |
| Recurrence option | ✅ | `TourDeparture.recurrence_rule` |

---

### 10.3 Mandatory Tour Fields

#### Basic Information

| Field | Status | Notes |
|---|---|---|
| Tour title | ✅ | `Tour.title` |
| Short summary | ✅ | `Tour.short_summary` |
| Detailed description | ✅ | `Tour.description` |
| Cover image | ✅ | `Tour.cover_image_url` |
| Gallery | ✅ | `Tour.gallery_images` (JSONB) |
| Tour category | ❌ | PRD distinguishes category (e.g. "Beach", "Cultural") from type (e.g. "Day Tour"). No separate `category` field exists; only `tour_type`. |
| Tour type | ✅ | `Tour.tour_type` (14-value enum) |
| Primary destination | ✅ | `Tour.primary_destination_id` FK to `locations` |
| Covered locations | ✅ | `Tour.covered_location_ids` (JSONB) |
| Duration | ✅ | `Tour.duration_days` |
| Number of days and nights | ✅ | `Tour.duration_days` + `Tour.duration_nights` |
| Minimum and maximum group size | ✅ | `Tour.min_group_size` + `Tour.max_group_size` |
| Suitable traveler type | ✅ | `Tour.suitable_traveler_type` |

#### Stay Information (`TourStay` child model)

| Field | Status | Notes |
|---|---|---|
| Stay name | ✅ | `TourStay.stay_name` |
| Property type | ❌ | No `property_type` field on `TourStay` (e.g. "Hotel", "Resort", "Homestay") |
| Room type | ❌ | No `room_type` field on `TourStay` |
| Number of nights | ❌ | No `nights_count` field; can be inferred from departure dates but not stored on `TourStay` |
| Occupancy arrangement | ✅ | `TourStay.occupancy_arrangement` |
| Room-sharing policy | ✅ | `TourStay.room_sharing_policy` |
| Check-in and check-out information | ✅ | `TourStay.check_in_out_info` |
| Stay photographs | ✅ | `TourStay.stay_photos` (JSONB) |
| Stay location | ✅ | `TourStay.stay_location` |
| Stay certification or trust badges | ❌ | No certification/badge fields on `TourStay` |
| Whether stay is owned / referred / externally sourced | ✅ | `TourStay.source_type` |

#### Transportation Profile (`TourTransport` child model)

| Field | Status | Notes |
|---|---|---|
| Transport provider | ✅ | `TourTransport.provider_name` |
| Vehicle type | ✅ | `TourTransport.vehicle_type` |
| Vehicle model or category | ✅ | `TourTransport.vehicle_model` |
| Air-conditioning status | ❌ | Not in `TourTransport` |
| Seating capacity | ❌ | Not in `TourTransport` |
| Driver included or excluded | ✅ | `TourTransport.driver_included` |
| Intercity transport details | ✅ | `TourTransport.intercity_details` |
| Local transport details | ✅ | `TourTransport.local_details` |
| Pickup location | ✅ | `TourTransport.pickup_location` |
| Pickup time | ✅ | `TourTransport.pickup_time` |
| Drop-off location | ✅ | `TourTransport.dropoff_location` |
| Drop-off time | ✅ | `TourTransport.dropoff_time` |
| Route information | ✅ | `TourTransport.route_info` |
| Luggage policy | ✅ | `TourTransport.luggage_policy` |
| Transportation photographs | ❌ | No `transport_photos` field |
| Vehicle safety documents | ❌ | No safety document upload on `TourTransport` |

#### Covered Locations (per-location detail, `TourItineraryDay`)

| Field | Status | Notes |
|---|---|---|
| Location tag | ✅ | `TourItineraryDay.location_id` FK |
| Planned visit date | ⚠️ | Only `day_number` (integer) exists, not an actual calendar date |
| Planned arrival time | ❌ | No arrival time field on `TourItineraryDay` |
| Planned departure time | ❌ | No departure time field on `TourItineraryDay` |
| Activity at the location | ✅ | `TourItineraryDay.activity_summary` |
| Entry fee inclusion status | ✅ | `TourItineraryDay.entry_fee_included` |
| Accessibility notes | ✅ | `TourItineraryDay.accessibility_notes` |
| Safety notes | ✅ | `TourItineraryDay.safety_notes` |

#### Food Menu (`TourMeal` child model)

| Field | Status | Notes |
|---|---|---|
| Number of included meals | ⚠️ | No top-level `meal_count` field; count must be derived from the number of `TourMeal` child records |
| Breakfast / Lunch / Dinner menus | ⚠️ | `TourMeal.meal_type` enum distinguishes type but there is no structured menu content (dish names, items). Description field is free text only. |
| Snacks and drinks | ❌ | No snack/drink category in meal types or separate field |
| Vegetarian options | ✅ | `TourMeal.is_vegetarian` |
| Vegan options | ✅ | `TourMeal.is_vegan` |
| Halal confirmation | ✅ | `TourMeal.is_halal` |
| Allergy information | ✅ | `TourMeal.allergy_notes` |
| Children's meal availability | ✅ | `TourMeal.children_menu_available` |
| Optional meal upgrades | ✅ | `TourMeal.optional_upgrade_price` |
| Food provider / restaurant name | ✅ | `TourMeal.restaurant_provider` |

#### Activities (`TourActivity` child model)

| Field | Status | Notes |
|---|---|---|
| Activity name | ✅ | `TourActivity.name` |
| Activity description | ✅ | `TourActivity.description` |
| Location | ✅ | `TourActivity.location` |
| Duration | ✅ | `TourActivity.duration_hours` |
| Included or paid add-on | ✅ | `TourActivity.addon_price` (null = included) |
| Minimum age | ✅ | `TourActivity.min_age` |
| Physical difficulty | ✅ | `TourActivity.difficulty_level` |
| Equipment required | ✅ | `TourActivity.equipment_required` |
| Safety requirement | ✅ | `TourActivity.safety_requirements` |
| Capacity | ✅ | `TourActivity.capacity` |
| Guide requirement | ✅ | `TourActivity.guide_required` |
| Weather dependency | ✅ | `TourActivity.weather_dependency` |

#### Security and Safety

| Field | Status | Notes |
|---|---|---|
| Emergency contact | ✅ | `Tour.emergency_contact` |
| Responsible Local Expert | ✅ | Implicit via tour owner FK |
| Assigned Guide | ✅ | `TourDeparture.assigned_guide_role_id` |
| Nearest hospital or clinic | ✅ | `Tour.nearest_hospital` |
| First-aid availability | ✅ | `Tour.first_aid_available` |
| Women-traveler safety arrangements | ✅ | `Tour.women_safety_arrangements` |
| Child-safety arrangements | ✅ | `Tour.child_safety_arrangements` |
| Night-travel policy | ✅ | `Tour.night_travel_policy` |
| Weather-related risk | ✅ | `Tour.weather_risk_policy` |
| Activity risk level | ✅ | `Tour.activity_risk_level` |
| Local authority or permit requirements | ✅ | `Tour.local_authority_requirements` |
| Insurance inclusion or exclusion | ✅ | `Tour.insurance_included` |
| Emergency cancellation procedure | ✅ | `Tour.emergency_cancellation_procedure` |

#### Pickup and Drop-Off

| Field | Status | Notes |
|---|---|---|
| Exact pickup location | ✅ | `Tour.pickup_location` |
| Map pin (lat/lng) | ❌ | No coordinates on tour-level pickup; `TourTransport` has text fields only |
| Pickup window | ✅ | `Tour.pickup_window` |
| Contact person | ✅ | `Tour.pickup_contact_person` |
| Drop-off location | ✅ | `Tour.dropoff_location` |
| Estimated arrival time | ❌ | No `estimated_arrival_time` field |
| Optional home or hotel pickup | ✅ | `Tour.home_hotel_pickup_available` |
| Extra pickup charge | ✅ | `Tour.extra_pickup_charge` |
| Late-arrival policy | ✅ | `Tour.late_arrival_policy` |

#### Pricing

| Field | Status | Notes |
|---|---|---|
| Price per person | ✅ | `Tour.price_per_person` |
| Price per group | ✅ | `Tour.price_per_group` |
| Adult price | ✅ | `Tour.adult_price` |
| Child price | ✅ | `Tour.child_price` |
| Infant policy | ❌ | No `infant_price` or `infant_policy` field |
| Single-room supplement | ✅ | `Tour.single_room_supplement` |
| Couple price | ✅ | `Tour.couple_price` |
| Seasonal pricing | ✅ | `Tour.seasonal_pricing` (JSONB) |
| Weekend pricing | ✅ | `Tour.weekend_price` |
| Early-bird discount | ✅ | `Tour.early_bird_discount` |
| Group discount | ✅ | `Tour.group_discount` |
| Tax | ❌ | No `tax_rate` or `tax_amount` field |
| Service charge | ❌ | No `service_charge` field |
| Booking deposit | ❌ | No `booking_deposit` field |
| Full-payment deadline | ❌ | No `full_payment_deadline` field |
| Currency | ✅ | `Tour.currency` |

#### Included / Excluded Services

| Field | Status | Notes |
|---|---|---|
| Included services (Stay, Transport, Meals, Guide, Entry tickets, Activities, Safety equipment, Photography, Drinking water, Airport transfer, Other) | ✅ | `Tour.included_services` (JSONB array of strings) |
| Excluded services | ✅ | `Tour.excluded_services` (JSONB array) |

#### Add-Ons

| Field | Status | Notes |
|---|---|---|
| Structured add-on catalog (Room upgrade, Private vehicle, Extra meal, Photography, Drone footage, Extra activity, Airport pickup, Personal guide, Travel insurance, Local product bundle, Early check-in, Late check-out) | ❌ | No dedicated `TourAddOn` model or table. Only per-activity `addon_price` flag exists. There is no way for a traveler to select optional add-ons at booking time. |

#### Policies

| Field | Status | Notes |
|---|---|---|
| Cancellation policy | ✅ | `Tour.cancellation_policy` |
| Refund policy | ✅ | `Tour.refund_policy` |
| Rescheduling policy | ✅ | `Tour.rescheduling_policy` |
| Minimum-participant policy | ✅ | `TourDeparture.min_participants` + `confirmation_threshold` |
| Bad-weather policy | ✅ | `Tour.bad_weather_policy` |
| No-show policy | ✅ | `Tour.no_show_policy` |
| Child policy | ✅ | `Tour.child_policy` |
| Pet policy | ✅ | `Tour.pet_policy` |
| Accessibility policy | ✅ | `Tour.accessibility_policy` |
| Traveler conduct policy | ✅ | `Tour.conduct_policy` |

---

### 10.4 Tour Publishing Workflow

All 14 PRD lifecycle statuses are implemented in `TourStatus` enum and handled in the admin + expert dashboards.

| Status | Status |
|---|---|
| Draft | ✅ |
| Submitted for Review | ✅ |
| Changes Requested | ✅ |
| Approved | ✅ |
| Scheduled | ✅ |
| Booking Open | ✅ |
| Almost Full | ✅ |
| Sold Out | ✅ |
| Confirmed | ✅ |
| In Progress | ✅ |
| Completed | ✅ |
| Cancelled | ✅ |
| Suspended | ✅ |
| Archived | ✅ |

The admin "Request Changes" workflow (new status + amber banner + resubmit button) is fully implemented end-to-end.

---

### 10.5 Tour Approval

| PRD Requirement | Status | Notes |
|---|---|---|
| Automatic approval for trusted Experts | ❌ | All tours require manual admin review regardless of Expert trust level. No auto-approval logic or "trusted expert" flag exists. |
| Manual approval for new Experts | ✅ | Admin reviews `submitted_for_review` tours and can approve, reject, or request changes. |
| Mandatory moderation for high-risk activities | ❌ | No automatic flagging of tours containing high-risk activity types for stricter review. |
| Reapproval after material price, itinerary or safety changes | ✅ | `MATERIAL_REAPPROVAL_FIELDS` set in `tours/service.py` triggers status rollback to `SUBMITTED_FOR_REVIEW` on edits to published tours. |

---

### Section 10 — Summary

| Category | Complete | Partial | Missing |
|---|---|---|---|
| Tour types (10.1) | 14/14 | 0 | 0 |
| Fixed-calendar fields (10.2) | 10/11 | 1 | 0 |
| Basic info fields (10.3) | 13/14 | 0 | 1 (category) |
| Stay sub-fields | 7/11 | 0 | 4 |
| Transport sub-fields | 10/14 | 0 | 4 |
| Covered location sub-fields | 5/8 | 1 | 2 |
| Food menu sub-fields | 7/12 | 2 | 3 |
| Activity sub-fields | 12/12 | 0 | 0 |
| Safety fields | 13/13 | 0 | 0 |
| Pickup/drop-off fields | 6/9 | 0 | 3 |
| Pricing fields | 9/16 | 0 | 7 |
| Services (included/excluded) | 2/2 | 0 | 0 |
| Add-ons | 0/1 | 0 | 1 |
| Policies | 10/10 | 0 | 0 |
| Workflow statuses (10.4) | 14/14 | 0 | 0 |
| Approval modes (10.5) | 2/4 | 0 | 2 |

---

## Section 12 — EXPERT BUSINESS AND SERVICE NETWORK

### 12.1 Adding Businesses

The `BusinessReferral` model (`backend/app/modules/business_network/models.py`) exists and allows a Local Expert to add businesses. However:

| PRD Requirement | Status | Notes |
|---|---|---|
| Hotel | ⚠️ | `business_type` is a free-text `String(100)` field, not an enum. All PRD business types are supported in theory but none are enforced or validated. |
| Resort | ⚠️ | Same |
| Homestay | ⚠️ | Same |
| Guesthouse | ⚠️ | Same |
| Restaurant | ⚠️ | Same |
| Local transport provider | ⚠️ | Same |
| Rent-a-Car operator | ⚠️ | Same |
| Activity provider | ⚠️ | Same |
| Photographer | ⚠️ | Same |
| Local product brand | ⚠️ | Same |
| Equipment-rental provider | ⚠️ | Same |
| Event or cultural service | ⚠️ | Same |
| Frontend UI to add businesses | ❌ | No expert dashboard page for adding/managing business referrals exists. Backend router exists but there is no frontend. |

---

### 12.2 Business Ownership Types

PRD requires five ownership types. Only two are implemented.

| PRD Type | Status | Notes |
|---|---|---|
| Owned by Expert | ✅ | `OwnershipType.OWNED` |
| Managed by Expert | ❌ | Not in the enum |
| Referred by Expert | ✅ | `OwnershipType.REFERRED` |
| Partner business | ❌ | Not in the enum |
| Unverified recommendation | ❌ | Not in the enum |

---

### 12.3 Business Approval

| PRD Requirement | Status | Notes |
|---|---|---|
| Responsible owner accepts the invitation | ✅ | `BusinessReferral.invite_token` + `invite_accepted_at` flow is modeled |
| Required documents are submitted | ❌ | No document upload field or document table for business referrals |
| Ovigo approves the business | ✅ | `ReferralStatus` enum (PENDING/APPROVED/REJECTED) + `is_business_verified` flag; admin router endpoint exists |
| Commission terms are accepted | ❌ | No `commission_terms_accepted` field or acceptance timestamp |

---

### 12.4 Expert Earnings

| Earning Type | Status | Notes |
|---|---|---|
| Direct Sale Earnings | ✅ | Commission module (`commissions/service.py`) handles expert tour/service sale payouts |
| Referral Commission | ⚠️ | `BusinessReferral.linked_partner_role_id` connects a referred business to an actual Ovigo partner, enabling referral commission tracking in principle. The commission engine itself is **not yet connected** (explicitly noted as Sprint 14-15 deferred in code comments). |
| Network Commission | ⚠️ | `BusinessReferral.custom_commission_rate` field exists for per-referral override, but the network commission calculation pipeline (guide/transport/property completions → referral payout) is not implemented. |
| Tour-Curation Commission | ❌ | No distinct commission type for an Expert bundling third-party services into a tour. The commissions module has no `TOUR_CURATION` category. |

---

### 12.5 Attribution Rules

| PRD Requirement | Status | Notes |
|---|---|---|
| Who added the business | ✅ | `BusinessReferral.referring_expert_role_id` |
| Who owns the business | ⚠️ | `invited_user_id` + `ownership_type`, but only two ownership types (see 12.2); "Managed by" and "Partner business" attribution are not distinguishable |
| Who sold the service | ❌ | No expert attribution on `BookingItem` records |
| Which booking generated revenue | ❌ | No `business_referral_id` FK on `Booking` or `BookingItem` |
| Which commission rule applied | ❌ | `custom_commission_rate` stored but no `commission_rule_id` linking to a formal rule record |
| Commission start and expiry date | ❌ | No start/expiry date fields on `BusinessReferral` or a commission agreement table |
| Customer acquisition channel (organic / Expert / advertising) | ❌ | No acquisition-channel field on `Booking` |

**Anti-fraud protections (PRD requirement to prevent):**

| Fraud Rule | Status | Notes |
|---|---|---|
| Self-referral manipulation | ❌ | No guard preventing an Expert from referring their own account/business |
| Duplicate business claims | ❌ | No uniqueness constraint on `business_name` + `referring_expert_role_id` combination |
| Fake ownership | ❌ | No ownership verification beyond `is_business_verified` boolean |
| Circular commission arrangements | ❌ | Not implemented |
| Commission after agreement expires | ❌ | No expiry mechanism on commission agreements |

---

### Section 12 — Summary

| Category | Complete | Partial | Missing |
|---|---|---|---|
| Business type options (12.1) | 0/12 | 12/12 | 0 (all partial — free text only, no enum) |
| Expert frontend for business management | 0/1 | 0 | 1 |
| Ownership types (12.2) | 2/5 | 0 | 3 |
| Approval workflow (12.3) | 2/4 | 0 | 2 |
| Earnings types (12.4) | 1/4 | 2 | 1 |
| Attribution rules (12.5) | 1/7 | 1 | 5 |
| Anti-fraud protections (12.5) | 0/5 | 0 | 5 |

---

## Cross-Cutting Gaps (relevant to both §10 and §12)

### Local Expert Public Profile (PRD §8.2) — fields missing that affect §10 and §12 display

| Missing Field | Impact |
|---|---|
| `biography` / about text | Expert profile page has no bio/about section |
| `years_of_experience` | Not in `LocalExpertProfile` model or public schema |
| `languages` | Not surfaced on public profile (only expertise_categories) |
| `completed_booking_count` | Stats section on profile page shows `total_tours_conducted` but not booking count |
| Rating breakdown by category | `rating_avg` scalar exists; no per-category breakdown (safety, communication, value, etc.) |
| `avg_response_time` | `response_rate_percent` exists but no average response time field |
| Verified certifications | No `ExpertCertification` table; no display on profile |
| Traveler reviews display | Reviews module exists but not connected to the expert public profile page |
| Associated properties | Profile page does not link to any related stays/properties |
| Associated Guides | Guide supervision relationship not shown on Expert profile |
| Associated transport services | Not shown on Expert profile |
| Live-chat button | Chat module exists but no chat button on expert public profile |

---

## Top Priority Gaps to Build Next

The following are the highest-impact missing items ordered by PRD importance:

1. **Add-On system** — No `TourAddOn` model, no traveler add-on selection at booking. This affects every tour booking.
2. **Remaining seats calculation** — `TourDeparture` needs a computed/cached `remaining_seats` so listing pages can show availability.
3. **Infant policy / booking deposit / full-payment deadline / tax & service charge** — 7 missing pricing fields that affect checkout calculation accuracy.
4. **Transport: AC status, seating capacity, photos, safety docs** — 4 fields on `TourTransport` missing.
5. **Stay: property type, room type, nights count, certification badges** — 4 fields on `TourStay` missing.
6. **Itinerary day: arrival/departure times** — Required per PRD §10.3 Covered Locations.
7. **Tour category** (separate from type) — New field needed on `Tour`.
8. **Business ownership types (12.2)** — Enum missing 3 of 5 types.
9. **Business documents + commission terms acceptance (12.3)** — Required for approval workflow.
10. **Expert public profile: bio, languages, certifications, review display** — Several fields missing.
11. **Expert frontend for business network** — No UI exists to add/manage business referrals.
12. **Auto-approval for trusted Experts (10.5)** — No trust-tier flag on Expert role.
13. **Attribution: booking → referral link (12.5)** — Core of the commission chain.
14. **Anti-fraud rules (12.5)** — None of the 5 protections are implemented.
15. **Tour-Curation Commission type (12.4)** — Commission engine missing this category.
