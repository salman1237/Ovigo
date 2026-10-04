import { useSyncExternalStore } from "react";

/** Remembers the expert referral code a visitor arrived with (/join/{code}) until
 * they register and apply as a partner — possibly days later, on another page.
 * Browser storage is a convenience only: the backend also records the code on
 * the user at registration (users.signup_referral_link_id) and exposes it back via
 * GET /api/v1/referrals/invite, so a cleared or blocked localStorage just means
 * falling back to that. Every access is wrapped because storage can throw
 * (private mode, blocked site data). */
const STORAGE_KEY = "ovigo_ref";
const CHANGE_EVENT = "ovigo-ref-change";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function notify(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveReferralCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, savedAt: Date.now() }));
    notify();
  } catch {
    // storage unavailable — the server-side record covers this case
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    notify();
  } catch {
    // nothing to clear
  }
}

/** Pure read (no writes), so it's safe as a useSyncExternalStore snapshot. */
export function getStoredReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number };
    if (!parsed.code || !parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.code;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The remembered referral code, or null — always null during prerendering, then
 * the stored value once mounted in the browser. */
export function useStoredReferralCode(): string | null {
  return useSyncExternalStore(subscribe, getStoredReferralCode, () => null);
}
