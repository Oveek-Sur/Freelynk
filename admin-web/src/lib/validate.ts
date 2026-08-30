/** Trim anything, coerce non-strings to "". */
export function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Only links that are safe for a phone to open.
 *
 * Returns "" for an empty input (meaning "no link"), the normalised URL
 * when it is safe, and null when it must be rejected. A `javascript:` or
 * `intent:` URL here would be handed straight to the handset, so this is a
 * real gate rather than tidiness.
 *
 * `mailto:` is allowed alongside http(s) because an advert whose whole
 * purpose is "write to us" should open the mail app when tapped. It only
 * ever fills in a compose window — there is nothing to execute — so it
 * carries none of the risk that keeps the other schemes out.
 */
const OPENABLE = new Set(["http:", "https:", "mailto:"]);

export function safeLink(raw: string): string | null {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return OPENABLE.has(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * An image address the phone will actually be able to load.
 *
 * Stricter than [safeLink] on purpose: it demands https. The app targets
 * SDK 34, where Android blocks cleartext traffic by default, so an http://
 * image previews perfectly in the admin's browser and then shows up broken
 * on every phone. Refusing it here is the only place that mismatch can be
 * caught before it ships.
 *
 * Returns "" for empty, the normalised URL when usable, null to reject.
 */
export function safeImageUrl(raw: string): string | null {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Digits, spaces, +, -, ( ) only — keeps `tel:` links well-formed. */
export function safePhone(raw: string): string | null {
  if (!raw) return "";
  const trimmed = raw.trim();
  return /^[+0-9][0-9\s\-()]{4,24}$/.test(trimmed) ? trimmed : null;
}
