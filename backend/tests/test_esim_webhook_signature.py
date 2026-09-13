import hashlib
import hmac
import json

from app.modules.esim.router import verify_webhook_signature

SECRET = "whsec_test_secret"
BODY = b'{"order_id":"abc123","status":"COMPLETED"}'


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_accepts_correct_signature_over_raw_bytes():
    signature = _sign(SECRET, BODY)
    assert verify_webhook_signature(SECRET, BODY, signature) is True


def test_rejects_tampered_body():
    signature = _sign(SECRET, BODY)
    tampered = BODY.replace(b"COMPLETED", b"FAILED   ")
    assert verify_webhook_signature(SECRET, tampered, signature) is False


def test_rejects_wrong_secret():
    signature = _sign("a-different-secret", BODY)
    assert verify_webhook_signature(SECRET, BODY, signature) is False


def test_rejects_missing_header():
    assert verify_webhook_signature(SECRET, BODY, "") is False
    assert verify_webhook_signature(SECRET, BODY, None) is False


def test_rejects_when_secret_not_configured():
    signature = _sign(SECRET, BODY)
    assert verify_webhook_signature(None, BODY, signature) is False


def test_reserialized_json_body_does_not_verify():
    """Parsing then re-dumping valid JSON can still change byte-for-byte content
    (key order, whitespace) — the signature must be computed over the exact raw
    bytes received, never a round-tripped re-serialization."""
    signature = _sign(SECRET, BODY)
    reserialized = json.dumps(json.loads(BODY)).encode()
    assert reserialized != BODY  # sanity: dumps() doesn't reproduce the original bytes
    assert verify_webhook_signature(SECRET, reserialized, signature) is False
