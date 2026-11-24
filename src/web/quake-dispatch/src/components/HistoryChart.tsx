import { useState } from 'react'
import { api } from '../api'
import { mockAccelHistory } from '../api/mock'
import { HISTORY_RANGES, HOUR_HISTORY_POLL_MS, type HistoryRange } from '../config'
import { usePolling } from '../hooks/usePolling'
import type { DashboardView } from '../lib/derive'
import { formatAccel } from '../lib/format'
import { waitingState } from '../lib/waiting'
import type { AccelPoint } from '../types'
import { LazyAccelerationChart } from './LazyAccelerationChart'
import { DemoBadge } from './StatusBadge'
import { WidgetState } from './WidgetState'
import './HistoryChart.css'

interface Props {
  view: DashboardView | null
  /** Network history from the live snapshot (last 5 minutes, 1 s resolution). */
  liveHistory: AccelPoint[] | null
  apiConfigured: boolean
  error: Error | null
}

const HEIGHT = 380

const resolution: Record<HistoryRange['id'], string> = {
  '5m': 'maximul pe fiecare secundă, live',
  '1h': 'maximul pe 10 secunde',
  '24h': 'maximul pe 5 minute',
  '7d': 'maximul pe 30 de minute',
}

/** Requirement 2: acceleration over time, with confirmed earthquakes marked. */
export function HistoryChart({ view, liveHistory, apiConfigured, error }: Props) {
  const [rangeId, setRangeId] = useState<HistoryRange['id']>('5m')
  const range = HISTORY_RANGES.find((r) => r.id === rangeId) ?? HISTORY_RANGES[0]

  // The hour comes from the real endpoint; fetched only while that range is shown.
  const hour = usePolling(
    (signal) => api.getAccelHistory({ windowSec: 3600 }, signal),
    { intervalMs: HOUR_HISTORY_POLL_MS, key: 'network-1h', enabled: apiConfigured && range.source === 'api' },
  )

  let points: AccelPoint[] | undefined
  let rangeError: Error | null = null
  if (view) {
    if (range.source === 'live') points = liveHistory ?? undefined
    else if (range.source === 'api') {
      points = hour.data
      rangeError = hour.data ? null : hour.error
    } else {
      // MOCK: see src/api/mock.ts. Real events are placed on a simulated background.
      points = mockAccelHistory(range.windowSec, range.bucketSec, view.serverNow, view.events)
    }
  }

  return (
    <section className="panel area-chart" aria-labelledby="h-chart">
      <div className="panel-head">
        <div className="panel-head-text">
          <h2 id="h-chart" className="panel-title">
            Accelerație în rețea
          </h2>
          <p className="panel-note">
            {resolution[range.id]}
            {range.source === 'mock' && ' · fond simulat, cutremurele sunt reale'}
          </p>
        </div>
        <div className="panel-tools">
          {range.source === 'mock' && (
            <DemoBadge title="Fond simulat în src/api/mock.ts până când backend-ul oferă istoric agregat. Cutremurele marcate vin din /events." />
          )}
          <div className="segmented" role="group" aria-label="Interval">
            {HISTORY_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.id === range.id}
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-body">
        <ChartBody
          view={view}
          range={range}
          points={points}
          rangeError={rangeError}
          apiConfigured={apiConfigured}
          error={error}
        />
        {view && (
        <ul className="chart-legend" aria-hidden="true">
          <li>
            <span className="chart-legend-line" /> Accelerație maximă
          </li>
          <li>
            <span className="chart-legend-line" data-kind="threshold" /> Prag de declanșare
          </li>
          <li>
            <span className="chart-legend-dot" /> Cutremur confirmat
          </li>
        </ul>
        )}
      </div>
    </section>
  )
}

function ChartBody({
  view,
  range,
  points,
  rangeError,
  apiConfigured,
  error,
}: {
  view: DashboardView | null
  range: HistoryRange
  points: AccelPoint[] | undefined
  rangeError: Error | null
  apiConfigured: boolean
  error: Error | null
}) {
  if (!view) {
    const wait = waitingState(apiConfigured, error)
    return <WidgetState kind={wait.kind} message={wait.message} height={HEIGHT} />
  }
  if (rangeError) {
    return <WidgetState kind="error" message={`Istoricul pe o oră nu s-a încărcat. ${rangeError.message}`} height={HEIGHT} />
  }
  if (!points) return <WidgetState kind="loading" message="Se încarcă istoricul" height={HEIGHT} />
  if (points.length === 0) {
    return <WidgetState kind="empty" message={`Nicio măsurătoare în ultimele ${range.label}.`} height={HEIGHT} />
  }
  return (
    <LazyAccelerationChart
      points={points}
      threshold={view.threshold}
      end={view.serverNow}
      windowMs={range.windowSec * 1000}
      bucketMs={range.bucketSec * 1000}
      events={view.events}
      height={HEIGHT}
      label={`Accelerația maximă în rețea, ultimele ${range.label}, prag ${formatAccel(view.threshold)}`}
    />
  )
}
