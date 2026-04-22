/**
 * Per-account browser fingerprint library.
 *
 * Goal: generate a realistic, self-consistent Chrome fingerprint that can be
 * pinned to an account forever. Fingerprint mismatch between logins is one of
 * the most common soft-ban signals on IG/FB/LI, so we treat a fingerprint like
 * an identity card: generate once, never rotate unless the account is already
 * dead.
 *
 * We sample from 8 real Chrome builds (4 Windows, 4 Mac) captured from honest
 * Chrome sessions. All fields inside a preset are coherent (MacIntel UA never
 * paired with NVIDIA GPU, Windows UA never paired with Apple M1 renderer,
 * etc.) so the browser passes cross-field fingerprint audits.
 */

export interface FingerprintPreset {
  user_agent: string
  platform: string
  screen_width: number
  screen_height: number
  device_pixel_ratio: number
  color_depth: number
  hardware_concurrency: number
  device_memory: number
  webgl_vendor: string
  webgl_renderer: string
}

export interface GeneratedFingerprint extends FingerprintPreset {
  canvas_noise_seed: string
  audio_noise_seed: string
}

export interface GeoFields {
  timezone: string
  locale: string
  accept_language: string
  geo_lat: number | null
  geo_lon: number | null
}

/**
 * Real Chrome presets. Each one is a coherent bundle — do not mix fields
 * across presets. Captured from recent Chrome stable builds on real hardware.
 */
const PRESETS: FingerprintPreset[] = [
  // --- Windows 11, Intel, 1080p, NVIDIA integrated ---
  {
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "Win32",
    screen_width: 1920,
    screen_height: 1080,
    device_pixel_ratio: 1,
    color_depth: 24,
    hardware_concurrency: 8,
    device_memory: 8,
    webgl_vendor: "Google Inc. (NVIDIA)",
    webgl_renderer:
      "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  // --- Windows 11, Intel integrated, 1080p ---
  {
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Win32",
    screen_width: 1920,
    screen_height: 1080,
    device_pixel_ratio: 1,
    color_depth: 24,
    hardware_concurrency: 4,
    device_memory: 8,
    webgl_vendor: "Google Inc. (Intel)",
    webgl_renderer:
      "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  // --- Windows 11, 1440p, NVIDIA gaming ---
  {
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "Win32",
    screen_width: 2560,
    screen_height: 1440,
    device_pixel_ratio: 1,
    color_depth: 24,
    hardware_concurrency: 12,
    device_memory: 16,
    webgl_vendor: "Google Inc. (NVIDIA)",
    webgl_renderer:
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  // --- Windows 11 laptop, 1366x768, Intel integrated ---
  {
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "Win32",
    screen_width: 1366,
    screen_height: 768,
    device_pixel_ratio: 1,
    color_depth: 24,
    hardware_concurrency: 4,
    device_memory: 4,
    webgl_vendor: "Google Inc. (Intel)",
    webgl_renderer:
      "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  },
  // --- MacBook Pro M1, 1440x900 scaled ---
  {
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "MacIntel",
    screen_width: 1440,
    screen_height: 900,
    device_pixel_ratio: 2,
    color_depth: 30,
    hardware_concurrency: 8,
    device_memory: 8,
    webgl_vendor: "Google Inc. (Apple)",
    webgl_renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
  },
  // --- MacBook Pro M2 Pro, 1728x1117 scaled ---
  {
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "MacIntel",
    screen_width: 1728,
    screen_height: 1117,
    device_pixel_ratio: 2,
    color_depth: 30,
    hardware_concurrency: 10,
    device_memory: 16,
    webgl_vendor: "Google Inc. (Apple)",
    webgl_renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)",
  },
  // --- iMac Intel, 2560x1440 ---
  {
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    platform: "MacIntel",
    screen_width: 2560,
    screen_height: 1440,
    device_pixel_ratio: 2,
    color_depth: 30,
    hardware_concurrency: 8,
    device_memory: 16,
    webgl_vendor: "Google Inc. (Intel)",
    webgl_renderer: "ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)",
  },
  // --- MacBook Air M2, 1470x956 ---
  {
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    platform: "MacIntel",
    screen_width: 1470,
    screen_height: 956,
    device_pixel_ratio: 2,
    color_depth: 30,
    hardware_concurrency: 8,
    device_memory: 8,
    webgl_vendor: "Google Inc. (Apple)",
    webgl_renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
  },
]

function randomHex(bytes: number): string {
  let out = ""
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  }
  return out
}

/**
 * Pick a random coherent preset and stamp in unique noise seeds.
 * Call once per account and store the result — never regenerate unless the
 * account is already burned.
 */
export function generateFingerprint(): GeneratedFingerprint {
  const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)]
  return {
    ...preset,
    canvas_noise_seed: randomHex(16),
    audio_noise_seed: randomHex(16),
  }
}

/**
 * Light city → geo map for common sender locations. When a proxy moves, the
 * dashboard can re-derive these without regenerating the hardware fingerprint.
 * Lat/lon are city centers, good enough for timezone + geolocation fallback.
 */
const CITY_TABLE: Record<
  string,
  { timezone: string; locale: string; lat: number; lon: number }
> = {
  // United States
  "new york city": { timezone: "America/New_York", locale: "en-US", lat: 40.7128, lon: -74.006 },
  "new york": { timezone: "America/New_York", locale: "en-US", lat: 40.7128, lon: -74.006 },
  "los angeles": { timezone: "America/Los_Angeles", locale: "en-US", lat: 34.0522, lon: -118.2437 },
  "chicago": { timezone: "America/Chicago", locale: "en-US", lat: 41.8781, lon: -87.6298 },
  "houston": { timezone: "America/Chicago", locale: "en-US", lat: 29.7604, lon: -95.3698 },
  "miami": { timezone: "America/New_York", locale: "en-US", lat: 25.7617, lon: -80.1918 },
  "atlanta": { timezone: "America/New_York", locale: "en-US", lat: 33.749, lon: -84.388 },
  "dallas": { timezone: "America/Chicago", locale: "en-US", lat: 32.7767, lon: -96.797 },
  "phoenix": { timezone: "America/Phoenix", locale: "en-US", lat: 33.4484, lon: -112.074 },
  "san francisco": { timezone: "America/Los_Angeles", locale: "en-US", lat: 37.7749, lon: -122.4194 },
  "seattle": { timezone: "America/Los_Angeles", locale: "en-US", lat: 47.6062, lon: -122.3321 },
  "boston": { timezone: "America/New_York", locale: "en-US", lat: 42.3601, lon: -71.0589 },
  "denver": { timezone: "America/Denver", locale: "en-US", lat: 39.7392, lon: -104.9903 },
  "las vegas": { timezone: "America/Los_Angeles", locale: "en-US", lat: 36.1699, lon: -115.1398 },
  // Canada
  "toronto": { timezone: "America/Toronto", locale: "en-CA", lat: 43.6532, lon: -79.3832 },
  "vancouver": { timezone: "America/Vancouver", locale: "en-CA", lat: 49.2827, lon: -123.1207 },
  "montreal": { timezone: "America/Toronto", locale: "en-CA", lat: 45.5017, lon: -73.5673 },
  // UK
  "london": { timezone: "Europe/London", locale: "en-GB", lat: 51.5074, lon: -0.1278 },
  "manchester": { timezone: "Europe/London", locale: "en-GB", lat: 53.4808, lon: -2.2426 },
  // Australia
  "sydney": { timezone: "Australia/Sydney", locale: "en-AU", lat: -33.8688, lon: 151.2093 },
  "melbourne": { timezone: "Australia/Melbourne", locale: "en-AU", lat: -37.8136, lon: 144.9631 },
}

const COUNTRY_FALLBACK: Record<string, { timezone: string; locale: string }> = {
  US: { timezone: "America/New_York", locale: "en-US" },
  CA: { timezone: "America/Toronto", locale: "en-CA" },
  GB: { timezone: "Europe/London", locale: "en-GB" },
  UK: { timezone: "Europe/London", locale: "en-GB" },
  AU: { timezone: "Australia/Sydney", locale: "en-AU" },
}

/**
 * Derive timezone / locale / accept_language / geo from the proxy's country
 * and city. Prefer city when we know it; fall back to country.
 */
export function deriveGeoFields(country?: string | null, city?: string | null): GeoFields {
  const cityKey = (city || "").trim().toLowerCase()
  const countryKey = (country || "").trim().toUpperCase()

  const cityHit = CITY_TABLE[cityKey]
  if (cityHit) {
    return {
      timezone: cityHit.timezone,
      locale: cityHit.locale,
      accept_language: `${cityHit.locale},en;q=0.9`,
      geo_lat: cityHit.lat,
      geo_lon: cityHit.lon,
    }
  }

  const countryHit = COUNTRY_FALLBACK[countryKey]
  if (countryHit) {
    return {
      timezone: countryHit.timezone,
      locale: countryHit.locale,
      accept_language: `${countryHit.locale},en;q=0.9`,
      geo_lat: null,
      geo_lon: null,
    }
  }

  // Unknown — safe en-US default. Better than crashing.
  return {
    timezone: "America/New_York",
    locale: "en-US",
    accept_language: "en-US,en;q=0.9",
    geo_lat: null,
    geo_lon: null,
  }
}
