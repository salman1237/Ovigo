"""One-time (or re-run-to-rotate) setup: registers Ovigo's Triptel webhook endpoint.

Running this REPLACES the webhook secret Triptel already has on file — the printed
secret must be set as TRIPTEL_WEBHOOK_SECRET on the backend and redeployed
immediately, or the old secret (already invalid) is all that's left configured.

    python scripts/configure_triptel_webhook.py [webhook_url]

Defaults to https://ovigo-api.salmandev.io/api/v1/esim/webhooks/triptel if no URL is
given.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.all_models  # noqa: E402, F401
from app.modules.esim import triptel_client  # noqa: E402

DEFAULT_WEBHOOK_URL = "https://ovigo-api.salmandev.io/api/v1/esim/webhooks/triptel"


async def main() -> None:
    webhook_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WEBHOOK_URL
    print(f"Registering webhook URL: {webhook_url}")
    result = await triptel_client.set_webhook(webhook_url)
    print("\nWebhook registered.")
    print(f"webhook_url: {result['webhook_url']}")
    print(f"\nwebhook_secret: {result['webhook_secret']}")
    print(
        "\nSet this as TRIPTEL_WEBHOOK_SECRET on the Dokploy `ovigo-api` application "
        "and redeploy NOW — the previous secret stopped working the moment this "
        "script ran. Running this script again rotates the secret again."
    )


asyncio.run(main())
