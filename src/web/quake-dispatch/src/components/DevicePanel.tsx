import { useEffect, useRef } from 'react'
import { api } from '../api'
import { ACCEL_UNIT, HISTORY_WINDOW_S, POLL_INTERVAL_MS } from '../config'
import { usePolling } from '../hooks/usePolling'
import type { DeviceState } from '../lib/derive'
import {
  deviceKindLabel,
  formatAgo,
  formatCoords,
  formatDateTime,
  formatLongDate,
  formatNumber,
  formatTime,
} from '../lib/format'
import type { Device, Event, Telemetry, Trigger, Vector3 } from '../types'
import { LazyAccelerationChart } from './LazyAccelerationChart'
import { describeDisarm } from '../lib/arming'
import { ArmLabel } from './ArmLabel'
import { StatusLabel } from './StatusLabel'
import { TriggerTimeline } from './TriggerTimeline'
import './DevicePanel.css'

interface Props {
  device: Device
  telemetry: Telemetry | undefined
  state: DeviceState
  triggers: Trigger[]
  events: Event[]
  deviceById: Map<string, Device>
  threshold: number
  serverNow: number
  onClose: () => void
}

export function DevicePanel({
  device,
  telemetry,
  state,
  triggers,
  events,
  deviceById,
  threshold,
  serverNow,
  onClose,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  const history = usePolling(
    (signal) => api.getAccelHistory({ deviceId: device.id, windowSec: HISTORY_WINDOW_S }, signal),
    { intervalMs: POLL_INTERVAL_MS, key: device.id },
  )

  // Move focus into the panel when a different device is opened.
  useEffect(() => {
    headingRef.current?.focus()
  }, [device.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const own = triggers.filter((t) => t.deviceId === device.id)
  const latency = telemetry?.receivedAt ? Date.parse(telemetry.receivedAt) - Date.parse(telemetry.recordedAt) : null

  return (
    <aside className="device-panel" aria-labelledby="device-panel-title">
      <div className="device-panel-head">
        <div>
          <h2 id="device-panel-title" className="device-panel-title" tabIndex={-1} ref={headingRef}>
            {device.name}
          </h2>
          <p className="device-panel-sub">
            {deviceKindLabel[device.kind]}
            {device.model && device.model !== device.name ? `, model ${device.model}` : ''}, {device.locality}
          </p>
        </div>
        <button type="button" className="device-panel-close" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Închide
        </button>
      </div>

      <div className="device-panel-status">
        <StatusLabel state={state} />
        {device.online && device.arming && <ArmLabel arming={device.arming} />}
        <span className="secondary">
          {device.lastSeenAt
            ? `Ultimul mesaj la ${formatTime(device.lastSeenAt)} UTC, ${formatAgo(device.lastSeenAt, serverNow)}`
            : 'Nu a trimis încă niciun mesaj'}
        </span>
        {device.online && device.arming?.state === 'unarmed' && (
          <span className="secondary">
            Nu participă la detectare
            {describeDisarm(device.arming.disarmReason) ? `: ${describeDisarm(device.arming.disarmReason)}` : ''}.
            {device.arming.armingSec > 0 &&
              ` Se armează după ${device.arming.armingSec} s nemișcat (acum ${device.arming.staticSec} s).`}
          </span>
        )}
      </div>

      {telemetry ? (
        <section className="device-panel-section" aria-labelledby="dp-values">
          <h3 id="dp-values" className="device-panel-h3">
            {state === 'offline' ? 'Ultimele valori primite' : 'Valori curente'}
          </h3>
          <p className="device-panel-accel" data-above={telemetry.accelMagnitude >= threshold || undefined}>
            <strong>{formatNumber(telemetry.accelMagnitude, 2)}</strong> {ACCEL_UNIT}
            <span className="secondary"> accelerație totală, prag {formatNumber(threshold, 2)}</span>
          </p>
          <dl className="device-panel-grid">
            <Vector label={`Accelerometru (${ACCEL_UNIT})`} v={telemetry.accel} digits={3} />
            <div className="device-panel-field device-panel-wide">
              <dt>Giroscop (rad/s)</dt>
              {telemetry.gyro ? (
                <dd className="device-panel-vector">
                  <span>
                    <span className="secondary">RMS</span> {formatNumber(telemetry.gyro.rms, 4)}
                  </span>
                  {telemetry.gyro.peak !== null && (
                    <span>
                      <span className="secondary">vârf</span> {formatNumber(telemetry.gyro.peak, 4)}
                    </span>
                  )}
                </dd>
              ) : (
                <dd className="secondary">nu e raportat</dd>
              )}
            </div>
            <div className="device-panel-field">
              <dt>Latență mesaj</dt>
              <dd>{latency !== null ? `${Math.round(latency)} ms` : <span className="secondary">nu e raportată</span>}</dd>
            </div>
            <div className="device-panel-field device-panel-wide">
              <dt>GPS</dt>
              <dd>
                {telemetry.gps ? (
                  <>
                    {formatCoords(telemetry.gps)}
                    {telemetry.gps.accuracy !== null && (
                      <span className="secondary"> precizie ±{formatNumber(telemetry.gps.accuracy, 0)} m</span>
                    )}
                  </>
                ) : (
                  <span className="secondary">fără GPS</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="empty">Dispozitivul nu a trimis încă date.</p>
      )}

      <section className="device-panel-section" aria-labelledby="dp-chart">
        <h3 id="dp-chart" className="device-panel-h3">
          Accelerație, ultimele {HISTORY_WINDOW_S / 60} minute
        </h3>
        {history.data ? (
          history.data.length > 0 ? (
            <LazyAccelerationChart
              points={history.data}
              threshold={threshold}
              end={serverNow}
              events={events}
              height={200}
              label={`Accelerația dispozitivului ${device.name}`}
            />
          ) : (
            <p className="secondary">Nicio măsurătoare în ultimele {HISTORY_WINDOW_S / 60} minute.</p>
          )
        ) : (
          <div className="device-panel-chart-wait" style={{ height: 200 }}>
            {history.error ? history.error.message : 'Se încarcă istoricul'}
          </div>
        )}
      </section>

      <section className="device-panel-section" aria-labelledby="dp-triggers">
        <h3 id="dp-triggers" className="device-panel-h3">
          Depășiri ale pragului
        </h3>
        <TriggerTimeline
          triggers={own}
          events={events}
          deviceById={deviceById}
          serverNow={serverNow}
          onSelectDevice={() => {}}
          compact
        />
      </section>

      <section className="device-panel-section" aria-labelledby="dp-id">
        <h3 id="dp-id" className="device-panel-h3">
          Identificare
        </h3>
        <dl className="device-panel-grid">
          <div className="device-panel-field">
            <dt>ID</dt>
            <dd>{device.id}</dd>
          </div>
          <div className="device-panel-field">
            <dt>Înregistrat</dt>
            <dd>{formatLongDate(device.registeredAt)}</dd>
          </div>
          <div className="device-panel-field device-panel-wide">
            <dt>Poziție înregistrată</dt>
            <dd>{device.location ? formatCoords(device.location) : <span className="secondary">necunoscută</span>}</dd>
          </div>
          {telemetry && (
            <div className="device-panel-field device-panel-wide">
              <dt>Ultima citire pe telefon</dt>
              <dd>{formatDateTime(telemetry.recordedAt)} UTC</dd>
            </div>
          )}
        </dl>
      </section>
    </aside>
  )
}

function Vector({ label, v, digits, total }: { label: string; v: Vector3 | null; digits: number; total?: number }) {
  if (!v) {
    return (
      <div className="device-panel-field device-panel-wide">
        <dt>{label}</dt>
        <dd className="secondary">nu e raportat pe axe</dd>
      </div>
    )
  }
  return (
    <div className="device-panel-field device-panel-wide">
      <dt>{label}</dt>
      <dd className="device-panel-vector">
        <span>
          <span className="secondary">x</span> {formatNumber(v.x, digits)}
        </span>
        <span>
          <span className="secondary">y</span> {formatNumber(v.y, digits)}
        </span>
        <span>
          <span className="secondary">z</span> {formatNumber(v.z, digits)}
        </span>
        {total !== undefined && (
          <span>
            <span className="secondary">total</span> {formatNumber(total, digits)}
          </span>
        )}
      </dd>
    </div>
  )
}
