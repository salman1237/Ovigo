import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.rentcar.models import TransmissionType, VehicleStatus, VehicleType


class DriverCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    license_number: str = Field(min_length=2, max_length=100)
    phone: str | None = None


class DriverRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    license_number: str
    phone: str | None
    is_available: bool
    created_at: datetime


class VehicleCreate(BaseModel):
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1990, le=2100)
    vehicle_type: VehicleType
    transmission: TransmissionType
    seats: int = Field(default=4, ge=1, le=60)
    price_per_day: Decimal = Field(gt=0)
    with_driver: bool = False
    assigned_driver_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=2000)


class VehicleUpdate(BaseModel):
    make: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, ge=1990, le=2100)
    vehicle_type: VehicleType | None = None
    transmission: TransmissionType | None = None
    seats: int | None = Field(default=None, ge=1, le=60)
    price_per_day: Decimal | None = Field(default=None, gt=0)
    with_driver: bool | None = None
    assigned_driver_id: uuid.UUID | None = None
    description: str | None = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rent_a_car_role_id: uuid.UUID
    make: str
    model: str
    year: int
    vehicle_type: VehicleType
    transmission: TransmissionType
    seats: int
    price_per_day: Decimal
    with_driver: bool
    assigned_driver_id: uuid.UUID | None
    description: str | None
    status: VehicleStatus
    rejection_reason: str | None
    created_at: datetime


class VehicleAvailabilityRangeSet(BaseModel):
    vehicle_id: uuid.UUID
    start_date: date
    end_date: date
    is_available: bool

    @model_validator(mode="after")
    def check_dates(self) -> "VehicleAvailabilityRangeSet":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class VehicleAvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    is_available: bool
