from pydantic import BaseModel


class FxRatesRead(BaseModel):
    base: str = "BDT"
    rates: dict[str, float]
