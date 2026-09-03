"""On-demand chat message translation (Sprint 25-26 "Internationalization"): a
traveler or partner can translate a chat message between English and Bengali —
Ovigo's two primary languages — via api.mymemory.translated.net, a free, keyless
translation API already validated working for this exact language pair earlier in
this project. Scoped to en<->bn only, not "translate to any language": Ovigo's
traveler base is overwhelmingly either Bangladesh-based (Bengali) or international
(English), and a bounded two-language toggle avoids needing a source-language
auto-detection step this free API doesn't reliably offer.

Not cached (unlike core/fx.py's shared, slow-changing exchange rates): a chat
message's text is essentially unique per call, so a cache keyed on it would almost
never hit. Called on-demand — a user clicks "Translate" on one message — not on
every message load, keeping volume well within MyMemory's generous free anonymous
quota.
"""
import httpx

TRANSLATE_API_URL = "https://api.mymemory.translated.net/get"


async def translate_text(text: str, target_lang: str) -> str | None:
    """`target_lang` is "en" or "bn" — the source is inferred as the other one,
    since this module only supports Ovigo's two primary languages. Returns None on
    any failure (network, upstream outage, empty input) rather than raising — the
    caller shows the original message unchanged, never a broken chat."""
    if not text.strip():
        return None
    source_lang = "bn" if target_lang == "en" else "en"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                TRANSLATE_API_URL, params={"q": text, "langpair": f"{source_lang}|{target_lang}"}
            )
            response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    return data.get("responseData", {}).get("translatedText") or None
