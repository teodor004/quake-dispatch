import { createEventsApi } from './events'
import { createHttpApi } from './http'
import { ApiError, type DashboardApi } from './types'

export type { DashboardApi, HistoryQuery } from './types'
export { ApiError } from './types'

/** Single GET /events endpoint (what the backend has today); takes precedence. */
const eventsUrl = import.meta.env.VITE_EVENTS_URL?.trim() || null
/** Full REST API described in README.md (devices, telemetry, triggers, events, status). */
const baseUrl = import.meta.env.VITE_API_URL?.trim() || null

/** False until one of the URLs is set; the dashboard then shows its empty layout. */
export const apiConfigured = eventsUrl !== null || baseUrl !== null

const notConfigured = () =>
  Promise.reject(new ApiError('API-ul nu este configurat. Setează VITE_EVENTS_URL în .env.local.'))

/** The single data access point used by the UI. */
export const api: DashboardApi = eventsUrl
  ? createEventsApi(eventsUrl)
  : baseUrl
    ? createHttpApi(baseUrl)
    : { getSnapshot: notConfigured, getAccelHistory: notConfigured }
