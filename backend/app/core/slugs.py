import re
import uuid


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "item"


def unique_suffix() -> str:
    return uuid.uuid4().hex[:6]
