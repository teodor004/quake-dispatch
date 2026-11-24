/**
 * MOCK DATA, clearly separated from the real API client.
 *
 * Everything here stands in for an endpoint the backend does not have yet.
 * Each export says what should replace it. Widgets that show mock data display
 * a "Date demo" badge, so nothing simulated is presented as measured.
 */

import type { AccelPoint, Event } from '../types'

/**
 * MOCK: long-range acceleration history (24 h, 7 days).
 *
 * Replace with an aggregated endpoint, for example
 *   GET /telemetry/history?windowSec=86400&bucketSec=300
 * returning AccelPoint[] with the max per bucket. The current endpoint has a
 * one-second resolution, which would be 604 800 points for 7 days.
 *
 * The background is simulated (stable for a given time, with a day/night
 * pattern); the confirmed events from /events are placed at their real time
 * and peak, so the event markers on the chart stay truthful.
 */
export function mockAccelHistory(
  windowSec: number,
  bucketSec: number,
  endMs: number,
  events: Event[],
): AccelPoint[] {
  const bucketMs = bucketSec * 1000
  const end = Math.floor(endMs / bucketMs) * bucketMs
  const start = end - windowSec * 1000
  const points: AccelPoint[] = []

  for (let t = start; t <= end; t += bucketMs) {
    const hour = new Date(t).getUTCHours()
    // More background vibration in the day (traffic, people walking with phones).
    const daytime = hour >= 6 && hour <= 20 ? 1 : 0.55
    const r = noise(t, 1)
    let peak = (0.06 + 0.08 * r) * daytime
    // Rare isolated spikes: a phone dropped or knocked, below the threshold.
    if (noise(t, 2) > 0.985) peak += 0.15 + 0.2 * noise(t, 3)
    points.push({ t: new Date(t).toISOString(), peak: Math.round(peak * 1000) / 1000 })
  }

  for (const e of events) {
    const at = Date.parse(e.startedAt)
    if (at < start || at > end) continue
    const index = Math.floor((at - start) / bucketMs)
    if (points[index]) points[index] = { t: points[index].t, peak: Math.max(points[index].peak, e.peakAccel) }
  }

  return points
}

/** Deterministic value in [0, 1) for a timestamp, so the chart does not jump between polls. */
function noise(timeMs: number, salt: number) {
  let x = (Math.floor(timeMs / 1000) ^ Math.imul(salt, 0x9e3779b1)) | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}
