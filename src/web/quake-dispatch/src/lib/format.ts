import { ACCEL_UNIT } from '../config'
import type { DeviceKind, GeoPoint } from '../types'

const LOCALE = 'ro-RO'

const numberFormats = new Map<number, Intl.NumberFormat>()
function numberFormat(digits: number) {
  let f = numberFormats.get(digits)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    numberFormats.set(digits, f)
  }
  return f
}

export function formatNumber(value: number, digits = 2) {
  return numberFormat(digits).format(value)
}

export function formatAccel(value: number, withUnit = true) {
  const n = formatNumber(value, 2)
  return withUnit ? `${n} ${ACCEL_UNIT}` : n
}

const timeUTC = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const shortTimeUTC = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dateUTC = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})
const longDateUTC = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

type TimeInput = string | number | Date

const toDate = (v: TimeInput) => (v instanceof Date ? v : new Date(v))

/** 14:32:07 */
export function formatTime(v: TimeInput) {
  return timeUTC.format(toDate(v))
}

/** 14:32 */
export function formatShortTime(v: TimeInput) {
  return shortTimeUTC.format(toDate(v))
}

/** 21 nov. */
export function formatDate(v: TimeInput) {
  return dateUTC.format(toDate(v))
}

/** 21 noiembrie 2026 */
export function formatLongDate(v: TimeInput) {
  return longDateUTC.format(toDate(v))
}

/** 21 nov., 14:32:07 */
export function formatDateTime(v: TimeInput) {
  return `${formatDate(v)}, ${formatTime(v)}`
}

/** Calendar day key in UTC, e.g. 2026-11-21. */
export function dayKey(v: TimeInput) {
  return toDate(v).toISOString().slice(0, 10)
}

/**
 * Romanian plural: 1 minut, 2 minute, 20 de minute.
 * Numbers whose last two digits are 0 or 20–99 take "de".
 */
function plural(n: number, one: string, many: string) {
  if (n === 1) return `1 ${one}`
  const rest = n % 100
  return rest === 0 || rest >= 20 ? `${n} de ${many}` : `${n} ${many}`
}

/** Elapsed time as words: "4 secunde", "3 ore", "20 de minute". */
export function formatElapsed(from: TimeInput, now: number) {
  const s = Math.max(1, Math.round((now - toDate(from).getTime()) / 1000))
  if (s < 60) return plural(s, 'secundă', 'secunde')
  const m = Math.floor(s / 60)
  if (m < 60) return plural(m, 'minut', 'minute')
  const h = Math.floor(m / 60)
  if (h < 24) return plural(h, 'oră', 'ore')
  return plural(Math.floor(h / 24), 'zi', 'zile')
}

/** "acum 4 secunde", "chiar acum" */
export function formatAgo(from: TimeInput, now: number) {
  return now - toDate(from).getTime() < 2000 ? 'chiar acum' : `acum ${formatElapsed(from, now)}`
}

/** 1 min 12 s */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`
  return `${s} s`
}

export function formatCoords({ lat, lon }: GeoPoint) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'V'
  return `${formatNumber(Math.abs(lat), 4)}° ${ns}, ${formatNumber(Math.abs(lon), 4)}° ${ew}`
}

export const deviceKindLabel: Record<DeviceKind, string> = {
  phone: 'Telefon',
  emulator: 'Emulator',
  simulated: 'Simulat',
}
