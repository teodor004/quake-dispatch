import type { AccelPoint } from '../types'

export interface SeriesRow {
  /** Bucket start, ms. */
  t: number
  /** Largest value in the bucket. */
  v: number
}

/** Max per bucket, so short spikes survive the downsampling. */
export function bucketMax(points: AccelPoint[], bucketMs: number): SeriesRow[] {
  const rows: SeriesRow[] = points.map((p) => ({ t: Date.parse(p.t), v: p.peak }))
  if (bucketMs <= 1000) return rows
  const byBucket = new Map<number, number>()
  for (const r of rows) {
    const key = Math.floor(r.t / bucketMs) * bucketMs
    const prev = byBucket.get(key)
    if (prev === undefined || r.v > prev) byBucket.set(key, r.v)
  }
  return [...byBucket].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t)
}
