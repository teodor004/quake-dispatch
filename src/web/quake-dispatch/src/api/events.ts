import {
  GRAVITY_MS2,
  HISTORY_WINDOW_S,
  ONLINE_WITHIN_MS,
  QUAKE_MIN_DEVICES,
  QUAKE_WINDOW_MS,
  READING_BUFFER_MS,
  TRIGGER_THRESHOLD_MS2,
} from '../config'
import type {
  AccelPoint,
  Arming,
  DashboardSnapshot,
  Device,
  Event,
  GeoPoint,
  SystemStatus,
  Telemetry,
  Trigger,
} from '../types'
import { lookupPlace } from '../lib/geocode'
import { fetchJson } from './fetchJson'
import type { DashboardApi } from './types'

/**
 * Client for the single endpoint the backend has today:
 *
 *   GET /events  →  { "events": [{ "device_id", "timestamp", "value", ... }] }
 *
 * Each item is one raw reading stored by POST /telemetry: `value` is the
 * magnitude of the phone's accelerometer, gravity included (≈ 9.81 at rest).
 * Despite the name, these are not earthquakes.
 *
 * The rest of the dashboard expects devices, triggers and confirmed
 * earthquakes, so they are derived here from the readings:
 * - readings are merged into an in-memory buffer across polls (the endpoint
 *   returns at most 50 items), which is also where history comes from;
 * - acceleration is shown without gravity: | value − g |;
 * - a trigger is a reading at or above TRIGGER_THRESHOLD_MS2;
 * - an earthquake is QUAKE_MIN_DEVICES devices triggering within QUAKE_WINDOW_MS.
 * Thresholds live in src/config.ts.
 *
 * Arming states come from GET /devices, next to /events on the same API:
 *
 *   GET /devices  →  { "devices": [{ "device_id", "state": "ARMED" | "UNARMED", ... }] }
 *
 * Only armed phones write to /events, so /devices is also the only place an
 * unarmed (but connected) phone shows up. If /devices is missing or fails, the
 * dashboard keeps working without states.
 *
 * Confirmed earthquakes are stored by the backend and come from GET /alerts,
 * so the list survives a page refresh:
 *
 *   GET /alerts  →  { "alerts": [{ "zone_id", "timestamp", "t_ms", "t_onset_ms",
 *                     "lat", "lon", "triggered_devices", "max_pga", ... }] }
 *
 * Earthquakes detected in the browser are still shown while they have no
 * stored alert yet (an earthquake under way, or a backend without /alerts).
 */

interface RawLocation {
  lat: number
  lon: number
  accuracy?: number | null
}

interface RawReading {
  device_id?: string
  deviceId?: string
  timestamp?: string
  value?: number | string
  pga?: number | string
  is_trigger?: boolean
  gyro_rms?: number | string | null
  gyro_peak?: number | string | null
  lat?: number | string | null
  lon?: number | string | null
  metadata?: {
    platform?: string
    location?: RawLocation | null
  } | null
}

interface RawDeviceState {
  device_id?: string
  state?: string
  static_sec?: number
  arming_sec?: number
  disarm_reason?: string | null
  /** Server clock of the last batch received from the phone, epoch ms. */
  updated_at_ms?: number
}

interface RawAlert {
  zone_id?: string
  timestamp?: string
  t_ms?: number | string
  t_onset_ms?: number | string
  lat?: number | string | null
  lon?: number | string | null
  triggered_devices?: string[]
  max_pga?: number | string
}

interface DeviceState {
  arming: Arming
  /** Server clock of the last batch, epoch ms. */
  seenAt: number | null
}

interface Reading {
  deviceId: string
  t: number
  /** Dynamic acceleration, gravity removed. */
  accel: number
  /** Authoritative backend trigger verdict (null only for legacy rows without is_trigger). */
  isTrigger: boolean | null
  gyro: Telemetry['gyro']
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Readings older than this count as finished when deciding if an earthquake is still active. */
const QUAKE_ACTIVE_MS = 30_000

/** A browser-detected earthquake and a stored alert this close in time are the same earthquake. */
const SAME_QUAKE_MS = 60_000

function alertToEvent(raw: RawAlert, now: number): Event | null {
  const t = toNumber(raw.t_ms) ?? (raw.timestamp ? Date.parse(raw.timestamp) : NaN)
  if (t === null || !Number.isFinite(t)) return null
  const onset = toNumber(raw.t_onset_ms)
  const start = onset !== null && onset <= t ? onset : t
  const lat = toNumber(raw.lat)
  const lon = toNumber(raw.lon)
  const deviceIds = raw.triggered_devices ?? []
  const active = now - t < QUAKE_ACTIVE_MS
  return {
    id: `a-${raw.zone_id ?? 'zone'}-${t}`,
    status: active ? 'active' : 'ended',
    startedAt: new Date(start).toISOString(),
    endedAt: active ? null : new Date(t).toISOString(),
    deviceIds,
    triggerCount: deviceIds.length,
    peakAccel: toNumber(raw.max_pga) ?? 0,
    epicenter: lat !== null && lon !== null ? { lat, lon } : null,
    region: null,
  }
}

/**
 * Stored alerts first; a browser-detected earthquake replaces the alert it matches
 * (it has live status and links to its triggers) and is kept on its own otherwise.
 */
function mergeEvents(stored: Event[], local: Event[]): Event[] {
  const merged = [...stored]
  for (const e of local) {
    const t = Date.parse(e.startedAt)
    const i = merged.findIndex(
      (s) => s.id.startsWith('a-') && Math.abs(Date.parse(s.startedAt) - t) <= SAME_QUAKE_MS,
    )
    if (i === -1) {
      merged.push(e)
      continue
    }
    const s = merged[i]
    merged[i] = {
      ...e,
      deviceIds: [...new Set([...e.deviceIds, ...s.deviceIds])],
      peakAccel: Math.max(e.peakAccel, s.peakAccel),
      epicenter: e.epicenter ?? s.epicenter,
    }
  }
  return merged.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10)
}

export function createEventsApi(url: string): DashboardApi {
  const readings = new Map<string, Reading>()
  const firstSeen = new Map<string, number>()
  const lastLocation = new Map<string, RawLocation>()
  /** Null until GET /devices answers; stays null if the backend has no such route. */
  let deviceStates: Map<string, DeviceState> | null = null
  const devicesUrl = /\/events\/?$/.test(url) ? url.replace(/\/events\/?$/, '/devices') : null
  const alertsUrl = /\/events\/?$/.test(url) ? url.replace(/\/events\/?$/, '/alerts') : null
  /** Last answer from GET /alerts; empty until it answers or if the route is missing. */
  let alerts: RawAlert[] = []

  async function pollAlerts(signal: AbortSignal) {
    if (!alertsUrl) return
    try {
      const body = await fetchJson<{ alerts?: RawAlert[] }>(alertsUrl, signal, 'GET /alerts')
      alerts = body.alerts ?? []
    } catch (err) {
      if (signal.aborted) throw err
      // Keep the last known alerts; browser detection still covers new earthquakes.
    }
  }

  async function pollStates(signal: AbortSignal) {
    if (!devicesUrl) return
    try {
      const body = await fetchJson<{ devices?: RawDeviceState[] }>(devicesUrl, signal, 'GET /devices')
      const next = new Map<string, DeviceState>()
      for (const raw of body.devices ?? []) {
        if (!raw.device_id) continue
        next.set(raw.device_id, {
          arming: {
            state: raw.state === 'ARMED' ? 'armed' : 'unarmed',
            staticSec: Number(raw.static_sec) || 0,
            armingSec: Number(raw.arming_sec) || 0,
            disarmReason: raw.disarm_reason || null,
          },
          seenAt: Number(raw.updated_at_ms) || null,
        })
      }
      deviceStates = next
    } catch (err) {
      if (signal.aborted) throw err
      // Keep the last known states; /events alone is enough for the rest of the dashboard.
    }
  }

  /** Duration of the last GET /events, the request the dashboard depends on. */
  let responseMs: number | null = null

  async function fetchEvents(signal: AbortSignal) {
    const started = performance.now()
    const body = await fetchJson<{ events?: RawReading[] } | RawReading[]>(url, signal, 'GET /events')
    responseMs = Math.round(performance.now() - started)
    return body
  }

  async function poll(signal: AbortSignal) {
    const [body] = await Promise.all([fetchEvents(signal), pollStates(signal), pollAlerts(signal)])
    const items = Array.isArray(body) ? body : (body.events ?? [])

    for (const raw of items) {
      const deviceId = raw.device_id ?? raw.deviceId
      const t = raw.timestamp ? Date.parse(raw.timestamp) : NaN
      const pga = raw.pga != null ? Number(raw.pga) : NaN
      const value = raw.value != null ? Number(raw.value) : NaN
      const accel = Number.isFinite(pga)
        ? pga
        : Number.isFinite(value)
          ? Math.abs(value - GRAVITY_MS2)
          : NaN
      if (!deviceId || !Number.isFinite(t) || !Number.isFinite(accel)) continue

      const gyroRms = toNumber(raw.gyro_rms)
      const gyro = gyroRms !== null ? { rms: gyroRms, peak: toNumber(raw.gyro_peak) } : null
      const isTrigger = typeof raw.is_trigger === 'boolean' ? raw.is_trigger : null

      const key = `${deviceId}|${t}`
      if (!readings.has(key)) readings.set(key, { deviceId, t, accel, isTrigger, gyro })
      if (!firstSeen.has(deviceId) || t < firstSeen.get(deviceId)!) firstSeen.set(deviceId, t)

      const metaLoc = raw.metadata?.location
      const topLat = raw.lat != null ? Number(raw.lat) : NaN
      const topLon = raw.lon != null ? Number(raw.lon) : NaN
      const loc: RawLocation | null =
        metaLoc && Number.isFinite(metaLoc.lat) && Number.isFinite(metaLoc.lon)
          ? metaLoc
          : Number.isFinite(topLat) && Number.isFinite(topLon)
            ? { lat: topLat, lon: topLon }
            : null
      if (loc) lastLocation.set(deviceId, loc)
    }

    // Keep memory bounded: drop what is older than the buffer, relative to the newest reading.
    let newest = 0
    for (const r of readings.values()) if (r.t > newest) newest = r.t
    for (const [key, r] of readings) if (r.t < newest - READING_BUFFER_MS) readings.delete(key)
  }

  function sorted(deviceId?: string) {
    const list = [...readings.values()].filter((r) => !deviceId || r.deviceId === deviceId)
    return list.sort((a, b) => a.t - b.t)
  }

  function snapshot(now: number): DashboardSnapshot {
    const all = sorted()
    const byDevice = new Map<string, Reading[]>()
    for (const r of all) {
      const list = byDevice.get(r.deviceId)
      if (list) list.push(r)
      else byDevice.set(r.deviceId, [r])
    }

    const devices: Device[] = []
    const latest: Telemetry[] = []
    // Unarmed phones have no readings, only a state: list them too.
    const ids = new Set([...byDevice.keys(), ...(deviceStates?.keys() ?? [])])
    for (const id of ids) {
      const list = byDevice.get(id)
      const last = list?.[list.length - 1]
      const state = deviceStates?.get(id)
      const seenAt = Math.max(last?.t ?? 0, state?.seenAt ?? 0)
      const loc = lastLocation.get(id)
      const location: GeoPoint | null = loc ? { lat: loc.lat, lon: loc.lon } : null
      devices.push({
        id,
        name: id,
        kind: 'phone',
        model: null,
        location,
        locality: location
          ? (lookupPlace(location) ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`)
          : 'fără GPS',
        online: seenAt > 0 && now - seenAt <= ONLINE_WITHIN_MS,
        lastSeenAt: seenAt > 0 ? new Date(seenAt).toISOString() : null,
        registeredAt: new Date(firstSeen.get(id) ?? (seenAt || now)).toISOString(),
        arming: deviceStates ? (state?.arming ?? null) : null,
      })
      if (!last) continue
      latest.push({
        deviceId: id,
        recordedAt: new Date(last.t).toISOString(),
        receivedAt: null,
        accel: null,
        accelMagnitude: last.accel,
        gyro: last.gyro,
        gps: loc ? { lat: loc.lat, lon: loc.lon, accuracy: loc.accuracy ?? null } : null,
      })
    }

    const detected = detect(all, now)
    const stored = alerts.map((a) => alertToEvent(a, now)).filter((e) => e !== null)
    const { triggers } = detected
    const events = mergeEvents(stored, detected.events).map((e) => ({
      ...e,
      region: e.region ?? (e.epicenter ? lookupPlace(e.epicenter) : null),
    }))
    const recentCount = all.filter((r) => r.t > now - 60_000).length
    const online = devices.filter((d) => d.online)
    const status: SystemStatus = {
      generatedAt: new Date(now).toISOString(),
      devicesTotal: devices.length,
      devicesOnline: online.length,
      devicesArmed: deviceStates ? online.filter((d) => d.arming?.state === 'armed').length : null,
      devicesUnarmed: deviceStates ? online.filter((d) => d.arming?.state === 'unarmed').length : null,
      messagesPerSecond: recentCount / 60,
      responseMs,
      latencyP50Ms: null,
      latencyP95Ms: null,
      triggerThreshold: TRIGGER_THRESHOLD_MS2,
    }

    return {
      devices,
      latest,
      history: perSecondMax(all, now - HISTORY_WINDOW_S * 1000),
      triggers,
      events,
      status,
    }
  }

  function detect(all: Reading[], now: number): { triggers: Trigger[]; events: Event[] } {
    const above = all.filter((r) =>
      r.isTrigger !== null ? r.isTrigger : r.accel >= TRIGGER_THRESHOLD_MS2,
    )
    const triggers: Trigger[] = above.map((r) => ({
      id: `${r.deviceId}|${r.t}`,
      deviceId: r.deviceId,
      at: new Date(r.t).toISOString(),
      peakAccel: r.accel,
      threshold: TRIGGER_THRESHOLD_MS2,
      eventId: null,
    }))

    // Group triggers that start within QUAKE_WINDOW_MS of each other.
    const events: Event[] = []
    let i = 0
    while (i < triggers.length) {
      const start = Date.parse(triggers[i].at)
      let j = i
      while (j + 1 < triggers.length && Date.parse(triggers[j + 1].at) - start <= QUAKE_WINDOW_MS) j++
      const group = triggers.slice(i, j + 1)
      const deviceIds = [...new Set(group.map((g) => g.deviceId))]
      if (deviceIds.length >= QUAKE_MIN_DEVICES) {
        const id = `q-${start}`
        const end = Date.parse(group[group.length - 1].at)
        const active = now - end < QUAKE_ACTIVE_MS
        for (const g of group) g.eventId = id
        events.push({
          id,
          status: active ? 'active' : 'ended',
          startedAt: new Date(start).toISOString(),
          endedAt: active ? null : new Date(end).toISOString(),
          deviceIds,
          triggerCount: group.length,
          peakAccel: Math.max(...group.map((g) => g.peakAccel)),
          epicenter: centroid(deviceIds.map((id) => lastLocation.get(id)).filter((l) => l !== undefined)),
          region: null,
        })
      }
      i = j + 1
    }

    return { triggers: triggers.reverse().slice(0, 50), events: events.reverse().slice(0, 20) }
  }

  return {
    async getSnapshot(signal) {
      await poll(signal)
      return snapshot(Date.now())
    },

    // History comes from the buffer: the endpoint has no time-range query.
    async getAccelHistory({ deviceId, windowSec }) {
      return perSecondMax(sorted(deviceId), Date.now() - windowSec * 1000)
    },
  }
}

function perSecondMax(list: Reading[], from: number): AccelPoint[] {
  const bySecond = new Map<number, number>()
  for (const r of list) {
    if (r.t < from) continue
    const s = Math.floor(r.t / 1000) * 1000
    const prev = bySecond.get(s)
    if (prev === undefined || r.accel > prev) bySecond.set(s, r.accel)
  }
  return [...bySecond]
    .sort((a, b) => a[0] - b[0])
    .map(([t, peak]) => ({ t: new Date(t).toISOString(), peak }))
}

/** Rough epicenter: the middle of the devices that confirmed the event. */
function centroid(points: RawLocation[]): GeoPoint | null {
  if (points.length === 0) return null
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length
  return { lat, lon }
}
