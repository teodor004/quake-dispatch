import { HISTORY_WINDOW_S } from '../config'
import type {
  AccelPoint,
  Device,
  Event,
  SystemStatus,
  Telemetry,
  Trigger,
} from '../types'
import { fetchJson } from './fetchJson'
import type { DashboardApi, HistoryQuery } from './types'

/**
 * REST client for the backend behind API Gateway.
 *
 * Endpoints:
 *   GET /devices
 *   GET /telemetry/latest
 *   GET /telemetry/history?windowSec=300[&deviceId=]
 *   GET /triggers?limit=50
 *   GET /events?limit=20
 *   GET /status
 */
export function createHttpApi(baseUrl: string): DashboardApi {
  const root = baseUrl.replace(/\/+$/, '')

  const get = <T,>(path: string, signal: AbortSignal) => fetchJson<T>(`${root}${path}`, signal, path)

  function historyPath({ deviceId, windowSec }: HistoryQuery) {
    const params = new URLSearchParams({ windowSec: String(windowSec) })
    if (deviceId) params.set('deviceId', deviceId)
    return `/telemetry/history?${params}`
  }

  return {
    async getSnapshot(signal) {
      // Independent requests, fired together.
      const [devices, latest, history, triggers, events, status] = await Promise.all([
        get<Device[]>('/devices', signal),
        get<Telemetry[]>('/telemetry/latest', signal),
        get<AccelPoint[]>(historyPath({ windowSec: HISTORY_WINDOW_S }), signal),
        get<Trigger[]>('/triggers?limit=50', signal),
        get<Event[]>('/events?limit=20', signal),
        get<SystemStatus>('/status', signal),
      ])
      return { devices, latest, history, triggers, events, status }
    },

    getAccelHistory(query, signal) {
      return get<AccelPoint[]>(historyPath(query), signal)
    },
  }
}
