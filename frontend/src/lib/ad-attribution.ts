/** Remembers the last sponsored ad a visitor clicked, so the booking it leads to
 * can be attributed to advertising (PRD §12.5 acquisition channel). The backend
 * only honors it when that campaign actually advertises something in the
 * booking, so a stale or unrelated click is harmless. Storage access is wrapped:
 * it can throw in private mode or with site data blocked. */
const STORAGE_KEY = "ovigo_ad_click";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveAdClick(campaignId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ campaignId, clickedAt: Date.now() }));
  } catch {
    // attribution is best-effort
  }
}

/** The clicked campaign's id, if the click is recent enough to count. Call at
 * booking time only (an event handler), never during render. */
export function getAdClickCampaignId(): string | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { campaignId?: string; clickedAt?: number };
    if (!parsed.campaignId || !parsed.clickedAt || Date.now() - parsed.clickedAt > MAX_AGE_MS) return undefined;
    return parsed.campaignId;
  } catch {
    return undefined;
  }
}
