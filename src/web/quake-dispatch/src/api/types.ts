import type { AccelPoint, DashboardSnapshot } from '../types'

export interface HistoryQuery {
  deviceId?: string
  windowSec: number
}

/** Everything the dashboard reads from the backend. */
export interface DashboardApi {
  getSnapshot(signal: AbortSignal): Promise<DashboardSnapshot>
  getAccelHistory(query: HistoryQuery, signal: AbortSignal): Promise<AccelPoint[]>
}

export class ApiError extends Error {
  readonly status: number | null
  /** The `error` field of a JSON error body, e.g. "db_unavailable". */
  readonly code: string | null

  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The API answered, but its database did not: 503 { "error": "db_unavailable" }. */
export function isDbUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === 'db_unavailable'
}
