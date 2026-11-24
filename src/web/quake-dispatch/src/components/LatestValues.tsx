import type { ReactNode } from 'react'
import { ACCEL_UNIT, STALE_AFTER_MS } from '../config'
import { useNow } from '../hooks/useNow'
import type { DashboardView } from '../lib/derive'
import { formatAgo, formatCoords, formatDateTime, formatNumber, formatTime } from '../lib/format'
import { accelLevel, intensityFromPga, type Level } from '../lib/intensity'
import { waitingState } from '../lib/waiting'
import { HealthBadge, LevelBadge } from './StatusBadge'
import { WidgetState } from './WidgetState'
import './LatestValues.css'

interface Props {
  view: DashboardView | null
  apiConfigured: boolean
  error: Error | null
  /** Client time of the last successful poll (ms). */
  updatedAt: number | null
}

const TILE_HEIGHT = 132

/** Requirement 1: the most recent readings, visible without scrolling. */
export function LatestValues({ view, apiConfigured, error, updatedAt }: Props) {
  if (!view) {
    const wait = waitingState(apiConfigured, error)
    return (
      <section className="latest" aria-label="Valori curente">
        <WidgetState kind={wait.kind} message={wait.message} height={TILE_HEIGHT} />
      </section>
    )
  }

  const { peakNow, latestEvent, threshold } = view
  const accel = peakNow?.telemetry.accelMagnitude ?? null
  const level = accel !== null ? accelLevel(accel, threshold) : undefined
  const intensity = latestEvent ? intensityFromPga(latestEvent.peakAccel) : null
  const eventActive = latestEvent?.status === 'active'

  return (
    <section className="latest" aria-label="Valori curente">
      <StatTile
        label="Accelerație maximă acum"
        level={level}
        value={accel !== null ? formatNumber(accel, 2) : '–'}
        unit={accel !== null ? ACCEL_UNIT : undefined}
        status={level && <LevelBadge level={level} />}
        meta={
          peakNow ? (
            <>
              {peakNow.device.name}, {peakNow.device.locality} · prag {formatNumber(threshold, 2)}
            </>
          ) : (
            'Niciun senzor online'
          )
        }
      />

      <StatTile
        label={eventActive ? 'Cutremur în desfășurare' : 'Ultimul cutremur detectat'}
        level={eventActive ? 'alert' : undefined}
        value={intensity ? intensity.roman : '–'}
        unit={intensity ? `intensitate est. · ${intensity.description}` : undefined}
        status={eventActive && <LevelBadge level="alert" />}
        meta={
          latestEvent ? (
            <>
              PGA {formatNumber(latestEvent.peakAccel, 2)} {ACCEL_UNIT} · {latestEvent.deviceIds.length} senzori ·{' '}
              {formatDateTime(latestEvent.startedAt)} UTC
            </>
          ) : (
            'Rețeaua nu a confirmat încă niciun cutremur'
          )
        }
      />

      <StatTile
        label={latestEvent ? 'Locația cutremurului' : 'Locația citirii maxime'}
        value={
          latestEvent
            ? (latestEvent.region ?? 'Zonă nedeterminată')
            : peakNow
              ? peakNow.device.locality
              : '–'
        }
        textValue
        meta={
          latestEvent?.epicenter
            ? `Epicentru estimat ${formatCoords(latestEvent.epicenter)}`
            : latestEvent
              ? 'Epicentrul nu a putut fi estimat'
              : peakNow?.telemetry.gps
                ? `GPS ${formatCoords(peakNow.telemetry.gps)}`
                : 'Fără poziție GPS'
        }
      />

      <LastUpdate lastReceivedAt={view.lastReceivedAt} serverNow={view.serverNow} updatedAt={updatedAt} />
    </section>
  )
}

/** Ticks every second on its own, so the rest of the row does not re-render. */
function LastUpdate({
  lastReceivedAt,
  serverNow,
  updatedAt,
}: {
  lastReceivedAt: number | null
  serverNow: number
  updatedAt: number | null
}) {
  const now = useNow(1000)
  if (lastReceivedAt === null) {
    return <StatTile label="Ultima dată primită" value="–" meta="Niciun senzor nu a trimis date" />
  }
  // Age on the server when the snapshot was made, plus time since we received the snapshot.
  const age = serverNow - lastReceivedAt + (updatedAt ? now - updatedAt : 0)
  const stale = age > STALE_AFTER_MS
  return (
    <StatTile
      label="Ultima dată primită"
      value={formatTime(lastReceivedAt)}
      unit="UTC"
      status={stale ? <HealthBadge health="degraded" /> : undefined}
      meta={
        <span data-stale={stale || undefined} className="latest-age">
          {formatAgo(now - age, now)}
          {stale && ' · datele nu mai sunt la zi'}
        </span>
      }
    />
  )
}

function StatTile({
  label,
  value,
  unit,
  status,
  meta,
  level,
  textValue,
}: {
  label: string
  value: string
  unit?: string
  status?: ReactNode
  meta: ReactNode
  level?: Level
  /** A place name instead of a number: smaller, allowed to wrap. */
  textValue?: boolean
}) {
  return (
    <div className="stat" data-level={level}>
      <div className="stat-head">
        <h2 className="stat-label">{label}</h2>
        {status}
      </div>
      <p className="stat-value" data-text={textValue || undefined}>
        <span className="stat-num">{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </p>
      <p className="stat-meta">{meta}</p>
    </div>
  )
}
