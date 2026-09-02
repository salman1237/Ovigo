"""Minimal RFC 5545 (iCalendar) generation and parsing for Sprint 23-24's stay
calendar sync — hand-rolled rather than adding a new dependency, since this
codebase's only need is VEVENT date ranges (export a room type's booked nights;
import an external listing's booked nights to block them), not the full iCalendar
spec (recurrence rules, timezones, alarms, ...). Good enough for round-tripping
with the date-range VEVENT shape every major calendar export (Airbnb, Booking.com,
Google Calendar, Outlook) produces.
"""
import re
from datetime import date, datetime, timezone


def build_calendar(events: list[tuple[str, date, date, str]], calendar_name: str) -> str:
    """`events` is (uid, start_date, end_date, summary) — `end_date` is exclusive
    (the day after the last booked night), matching DTEND's convention for
    date-only VEVENTs in RFC 5545."""
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ovigo//Booking Calendar//EN", f"X-WR-CALNAME:{calendar_name}"]
    for uid, start, end, summary in events:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}@ovigo.app",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{end.strftime('%Y%m%d')}",
            f"SUMMARY:{summary}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _unfold(text: str) -> list[str]:
    """RFC 5545 line folding: a continuation line starts with a space or tab."""
    raw_lines = text.replace("\r\n", "\n").split("\n")
    unfolded: list[str] = []
    for line in raw_lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def _parse_ics_date(value: str) -> date:
    digits = re.sub(r"[^0-9]", "", value)[:8]
    return datetime.strptime(digits, "%Y%m%d").date()


def parse_date_ranges(ics_text: str) -> list[tuple[date, date]]:
    """Extracts (start_date, end_date) from every VEVENT's DTSTART/DTEND — end_date
    is exclusive, same convention as build_calendar. A VEVENT missing either field
    is skipped rather than guessed at."""
    ranges: list[tuple[date, date]] = []
    start: date | None = None
    end: date | None = None
    for line in _unfold(ics_text):
        if line.startswith("BEGIN:VEVENT"):
            start = end = None
        elif line.startswith("DTSTART"):
            _, _, value = line.partition(":")
            start = _parse_ics_date(value)
        elif line.startswith("DTEND"):
            _, _, value = line.partition(":")
            end = _parse_ics_date(value)
        elif line.startswith("END:VEVENT"):
            if start is not None and end is not None:
                ranges.append((start, end))
    return ranges
