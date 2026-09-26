"""Cloudflare R2 (S3-compatible) object storage for images.

Images are served through a backend proxy endpoint (GET .../file returning the raw
bytes) rather than direct public R2 URLs — the bucket doesn't need "Public Access"
enabled for this to work, and it matches the pattern already used for partner
documents. Trade-off: image traffic round-trips through FastAPI Cloud instead of
hitting a CDN edge directly. Fine at this scale; swap to public r2.dev URLs or a
custom CDN domain later by enabling bucket Public Access and changing only the
image-serving endpoints (upload/storage code doesn't need to change).
"""
import uuid

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.core.exceptions import AppError, ConflictError

# Long-lived, immutable cache for image responses: every object is stored under a
# fresh uuid4 key (build_key below) and never overwritten in place, so once a URL
# has been served its bytes will never change — safe to cache for a year.
IMAGE_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}

# For images served from a *fixed* URL that can be replaced in place (cms/models.py's
# hero/banner/tile images — an admin re-upload keeps the same endpoint, unlike a
# tour/property image's fresh uuid4 key per upload) — the immutable header above
# would actively hide a real update from every browser for up to a year. Short
# cache instead; the frontend also appends a `?v=<updated_at>` cache-busting query
# param so a fresh upload is visible immediately, this is just the fallback for a
# raw/bookmarked URL without that param.
MUTABLE_IMAGE_CACHE_HEADERS = {"Cache-Control": "public, max-age=3600"}

settings = get_settings()

MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

_client = None


def _get_client():
    global _client
    if _client is None:
        if not settings.r2_configured:
            raise AppError("Image storage is not configured", status_code=503)
        _client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def validate_image(content_type: str, size: int) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ConflictError(f"Unsupported image type: {content_type}. Allowed: JPEG, PNG, WebP, GIF")
    if size > MAX_IMAGE_SIZE_BYTES:
        raise ConflictError("Image exceeds the 8MB upload limit")


def build_key(prefix: str, file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    return f"{prefix}/{uuid.uuid4().hex}.{ext}"


def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    _get_client().put_object(Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type)


def get_bytes(key: str) -> bytes:
    try:
        obj = _get_client().get_object(Bucket=settings.r2_bucket_name, Key=key)
        return obj["Body"].read()
    except ClientError as exc:
        raise AppError("Image not found in storage", status_code=404) from exc


async def get_bytes_async(key: str) -> bytes:
    """boto3 is synchronous — calling get_bytes directly from an async route handler
    blocks the whole event loop for the duration of the MinIO/R2 round trip, so every
    other concurrent request (including unrelated API calls and every other image on
    the same page) queues up behind it one at a time. Runs it in a worker thread
    instead so image requests actually happen in parallel."""
    return await run_in_threadpool(get_bytes, key)


def delete_object(key: str) -> None:
    try:
        _get_client().delete_object(Bucket=settings.r2_bucket_name, Key=key)
    except ClientError:
        pass  # already gone — fine, this is a best-effort cleanup call
