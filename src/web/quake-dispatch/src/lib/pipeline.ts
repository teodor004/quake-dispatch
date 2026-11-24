import { isDbUnavailable } from '../api/types'
import type { SystemStatus } from '../types'
import { formatElapsed, formatNumber } from './format'

/**
 * State of the data path Senzori → DynamoDB → API backend, for the status bar.
 *
 * Everything comes from the snapshot polling the dashboard already does:
 * - API: did the last GET /events succeed, and how long did it take;
 * - DynamoDB: a 503 { "error": "db_unavailable" } means the API is up but the
 *   database is not; a successful answer means reads work, and fresh readings
 *   mean writes work;
 * - Senzori: online and armed / unarmed counts from the last successful snapshot.
 */

export type PipelineTone = 'ok' | 'warn' | 'down' | 'unknown'

export interface PipelineNode {
  tone: PipelineTone
  /** Main line, e.g. "Online". */
  value: string
  /** Secondary line; adds information, never repeats the state. */
  detail: string
  /** The node's state in words, for screen readers. */
  ariaLabel: string
  /** Optional tooltip. */
  title?: string
}

export interface SensorsNode extends PipelineNode {
  /** Null when it cannot be checked ("? / 13"). */
  online: number | null
  /** Null until a snapshot arrived. */
  total: number | null
  /** Armed / unarmed counts; null when the API does not report arming states. */
  arming: { armed: number; unarmed: number } | null
}

export interface PipelineStatus {
  sensors: SensorsNode
  db: PipelineNode
  api: PipelineNode
  /** Whether data is flowing along each link. */
  links: { sensorsToDb: boolean; dbToApi: boolean }
}

export interface PipelineInput {
  apiConfigured: boolean
  /** Last successful snapshot's status; kept while requests fail. */
  status: SystemStatus | null
  /** Newest reading across all devices (ms), null when nothing was received. */
  lastReceivedAt: number | null
  /** Error of the last request, null when it succeeded. */
  error: Error | null
  /** When the current run of failures began (ms). */
  failingSince: number | null
  now: number
}

/** Newest reading older than this means sensors are not writing. */
export const WRITES_FRESH_MS = 30_000

const SENSORS = 'Senzori'
const DB = 'DynamoDB'
const API = 'API backend'

function node(label: string, tone: PipelineTone, value: string, detail: string, title?: string): PipelineNode {
  return { tone, value, detail, ariaLabel: `${label}: ${value}, ${detail}`, ...(title ? { title } : {}) }
}

export function derivePipelineStatus(input: PipelineInput): PipelineStatus {
  const { apiConfigured, status, lastReceivedAt, error, failingSince, now } = input
  const dbDown = isDbUnavailable(error)
  /** The last request succeeded, so the numbers in `status` are current. */
  const answered = apiConfigured && error === null && status !== null

  let api: PipelineNode
  if (!apiConfigured) api = node(API, 'unknown', 'Neconfigurat', 'lipsește VITE_EVENTS_URL')
  else if (dbDown) api = node(API, 'warn', 'Online, fără date', 'citirile eșuează')
  else if (error) {
    api = node(API, 'down', 'Offline', `fără răspuns de ${formatElapsed(failingSince ?? now, now)}`)
  } else if (!status) api = node(API, 'unknown', 'Se conectează', 'așteaptă primul răspuns')
  else {
    const ms = status.responseMs
    api = node(API, 'ok', 'Online', ms != null ? `răspunde în ${ms} ms` : 'răspunde')
  }

  let db: PipelineNode
  if (dbDown) db = node(DB, 'down', 'Offline', 'eroare db_unavailable')
  else if (!apiConfigured) db = node(DB, 'unknown', 'Necunoscut', 'API neconfigurat')
  else if (error) {
    db = node(
      DB,
      'unknown',
      'Necunoscut',
      'API-ul nu răspunde',
      'API-ul nu răspunde, starea bazei de date nu poate fi verificată',
    )
  } else if (!status) db = node(DB, 'unknown', 'Necunoscut', 'se verifică')
  else if (lastReceivedAt !== null && now - lastReceivedAt <= WRITES_FRESH_MS && status.messagesPerSecond > 0) {
    const rate = status.messagesPerSecond
    db = node(DB, 'ok', 'Online', `${formatNumber(rate, rate < 1 ? 2 : 1)} scrieri/s`)
  } else db = node(DB, 'warn', 'Online, inactivă', 'fără scrieri noi')

  const total = status?.devicesTotal ?? null
  const totalText = total ?? '?'
  let sensors: SensorsNode
  if (!answered) {
    sensors = {
      ...node(SENSORS, 'unknown', `? / ${totalText}`, 'nu se poate verifica'),
      ariaLabel: `${SENSORS}: nu se poate verifica`,
      online: null,
      total,
      arming: null,
    }
  } else {
    const online = status.devicesOnline
    const arming =
      status.devicesArmed != null && status.devicesUnarmed != null
        ? { armed: status.devicesArmed, unarmed: status.devicesUnarmed }
        : null
    const detail = arming ? `${arming.armed} armate · ${arming.unarmed} nearmate` : 'stări de armare indisponibile'
    sensors = {
      tone: online > 0 ? 'ok' : 'down',
      value: `${online} / ${totalText} online`,
      detail,
      ariaLabel: `${SENSORS}: ${online} din ${totalText} online, ${detail.replace(' · ', ', ')}`,
      online,
      total,
      arming,
    }
  }

  return {
    sensors,
    db,
    api,
    links: {
      sensorsToDb: sensors.tone === 'ok' && db.tone === 'ok',
      dbToApi: db.tone === 'ok' && api.tone === 'ok',
    },
  }
}
