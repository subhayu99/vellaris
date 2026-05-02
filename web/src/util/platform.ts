/**
 * Detect whether the user is on a Mac-flavored OS (macOS or iOS).
 *
 * Used so the disabled command-palette trigger renders the platform-correct
 * keyboard hint (⌘K on Mac, Ctrl+K elsewhere). Falls back to false in SSR /
 * non-browser contexts.
 *
 * Modern `navigator.userAgentData.platform` is preferred when available;
 * we fall back to the legacy `navigator.platform` / `userAgent` strings
 * that still ship in every browser. iPad on iOS 13+ reports as `MacIntel`
 * which is the behavior we want here.
 */
export function isAppleOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  if (uaData?.platform) {
    return /mac|ios/i.test(uaData.platform)
  }
  const platform = navigator.platform ?? ''
  if (platform) return /mac|iphone|ipad|ipod/i.test(platform)
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent ?? '')
}

/** Keyboard meta-key glyph: `⌘` on Apple platforms, `Ctrl` elsewhere. */
export function metaKeyLabel(): string {
  return isAppleOS() ? '⌘' : 'Ctrl+'
}
