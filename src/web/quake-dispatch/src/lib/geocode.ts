import type { GeoPoint } from '../types'

/**
 * Reverse geocoding with Nominatim (OpenStreetMap): coordinates → "city, county".
 *
 * lookupPlace() never waits: it returns the cached name, or null and queues a
 * request, so the next snapshot picks the name up. Nominatim's usage policy
 * asks for at most one request per second and for results to be cached, so
 * requests go out one at a time and answers are kept in localStorage.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const MIN_GAP_MS = 1100
const RETRY_AFTER_MS = 60_000
const STORAGE_KEY = 'quake-dispatch.places.v2'
const MAX_STORED = 500

/** Cache key rounded to ~1 km: GPS jitter and nearby phones share one lookup. */
const DECIMALS = 2
/** Nominatim zoom 10 resolves to a city. */
const ZOOM = 10

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  commune?: string
  county?: string
  state?: string
  country?: string
}

/** Empty string: Nominatim had no address there (sea, outside its data). */
const places = new Map<string, string>(loadStored())
const failedAt = new Map<string, number>()
const queue: { key: string; point: GeoPoint }[] = []
const queued = new Set<string>()
let running = false

function keyOf(point: GeoPoint) {
  return `${point.lat.toFixed(DECIMALS)},${point.lon.toFixed(DECIMALS)}`
}

export function lookupPlace(point: GeoPoint): string | null {
  const key = keyOf(point)
  const known = places.get(key)
  if (known !== undefined) return known || null
  const failed = failedAt.get(key)
  if (!queued.has(key) && (failed === undefined || Date.now() - failed > RETRY_AFTER_MS)) {
    queued.add(key)
    queue.push({ key, point })
    void drain()
  }
  return null
}

async function drain() {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const { key, point } = queue.shift()!
      try {
        places.set(key, await fetchPlace(point))
        failedAt.delete(key)
        store()
      } catch {
        failedAt.set(key, Date.now())
      }
      queued.delete(key)
      if (queue.length > 0) await new Promise((r) => setTimeout(r, MIN_GAP_MS))
    }
  } finally {
    running = false
  }
}

async function fetchPlace(point: GeoPoint): Promise<string> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(point.lat),
    lon: String(point.lon),
    zoom: String(ZOOM),
    addressdetails: '1',
    'accept-language': 'ro',
  })
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const body = (await res.json()) as { address?: NominatimAddress; error?: string }
  return body.address ? formatAddress(body.address) : ''
}

/** "Cluj-Napoca, Cluj"; the county is dropped when it repeats the city (București). */
function formatAddress(a: NominatimAddress): string {
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.commune
  const area = city ?? a.county ?? a.state ?? a.country
  const county = a.county?.replace(/^Județul /, '')
  return [area, county && county !== area ? county : null].filter(Boolean).join(', ')
}

function loadStored(): [string, string][] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as [string, string][]) : []
  } catch {
    return []
  }
}

function store() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...places].slice(-MAX_STORED)))
  } catch {
    // Private window or full storage: names are fetched again next time.
  }
}
