"""Entry point for FastAPI Cloud's default-file auto-detection.

The actual application lives in app/main.py (kept there so it sits alongside the rest of
app/, consistent with the modular-monolith layout in OVIGO_TECHNICAL_DOCUMENT.md §4.2).
This shim just re-exports it so `fastapi deploy`/FastAPI Cloud can find `main.py` at the
configured Application Directory root.
"""
from app.main import app  # noqa: F401
