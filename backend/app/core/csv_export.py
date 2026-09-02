"""Generic CSV rendering for admin report endpoints (technical document Sprint
21-22, admin "Reports" section) — takes whatever Pydantic row model a report
already returns for its JSON response and renders the same rows as CSV, so there's
one source of truth per report rather than a duplicate row-building path."""
import csv
import io

from pydantic import BaseModel


def rows_to_csv(rows: list[BaseModel]) -> str:
    if not rows:
        return ""
    buffer = io.StringIO()
    fieldnames = list(rows[0].model_dump().keys())
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row.model_dump())
    return buffer.getvalue()
