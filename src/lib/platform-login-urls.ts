/**
 * Single source of truth for canonical platform login URLs.
 *
 * Anywhere in the app that needs to "open the right login page" — the VNC
 * session bootstrapper, the platform-login modal, the goto helper — must
 * import from here. Don't duplicate the dictionary inline. When a platform
 * changes its login URL (X has done this twice in a year), we want exactly
 * one place to edit.
 *
 * Each URL has been verified to be the real login surface for that platform
 * as of April 2026. `youtube` and `google` both go to Google's signin —
 * YouTube uses Google's auth and there's no separate YT-only login flow.
 */
export const PLATFORM_LOGIN_URLS: Record<string, string> = {
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login",
  linkedin: "https://www.linkedin.com/login",
  tiktok: "https://www.tiktok.com/login",
  twitter: "https://x.com/i/flow/login",
  x: "https://x.com/i/flow/login",
  youtube: "https://accounts.google.com/signin",
  google: "https://accounts.google.com/signin",
  pinterest: "https://www.pinterest.com/login/",
  snapchat: "https://accounts.snapchat.com/accounts/v2/login",
  reddit: "https://www.reddit.com/login/",
  threads: "https://www.threads.net/login",
  whatsapp: "https://web.whatsapp.com/",
  telegram: "https://web.telegram.org/a/",
  discord: "https://discord.com/login",
}

/**
 * Case-insensitive lookup. Callers don't need to lowercase first — pass
 * whatever the platform string looks like (often comes from user input or
 * a DB row that may or may not be normalized) and we'll handle it.
 *
 * Returns `undefined` for unknown platforms so callers can decide whether
 * to fall back to about:blank, the platform homepage, or surface an error.
 */
export function getLoginUrl(platform: string): string | undefined {
  if (!platform) return undefined
  return PLATFORM_LOGIN_URLS[platform.toLowerCase()]
}
