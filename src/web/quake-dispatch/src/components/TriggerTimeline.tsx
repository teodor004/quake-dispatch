import { ACCEL_UNIT } from '../config'
import { dayKey, formatLongDate, formatNumber, formatShortTime, formatTime } from '../lib/format'
import type { Device, Event, Trigger } from '../types'
import './TriggerTimeline.css'

interface Props {
  triggers: Trigger[]
  events: Event[]
  deviceById: Map<string, Device>
  serverNow: number
  onSelectDevice: (id: string) => void
  /** Hide the device name, e.g. inside a device's own profile. */
  compact?: boolean
}

export function TriggerTimeline({ triggers, events, deviceById, serverNow, onSelectDevice, compact }: Props) {
  if (triggers.length === 0) {
    return <p className="empty">Niciun senzor nu a depășit pragul în ultima perioadă.</p>
  }

  const eventById = new Map(events.map((e) => [e.id, e]))
  const sorted = triggers.toSorted((a, b) => b.at.localeCompare(a.at))
  const today = dayKey(serverNow)
  const yesterday = dayKey(serverNow - 86_400_000)

  const groups: { key: string; items: Trigger[] }[] = []
  for (const t of sorted) {
    const key = dayKey(t.at)
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(t)
    else groups.push({ key, items: [t] })
  }

  const dayLabel = (key: string, sample: string) =>
    key === today ? 'Astăzi' : key === yesterday ? 'Ieri' : formatLongDate(sample)

  return (
    <div className="timeline" data-compact={compact || undefined}>
      {groups.map((g) => (
        <section key={g.key} className="timeline-day" aria-label={dayLabel(g.key, g.items[0].at)}>
          <h3 className="timeline-day-title">{dayLabel(g.key, g.items[0].at)}</h3>
          <ol className="timeline-list">
            {g.items.map((t) => {
              const device = deviceById.get(t.deviceId)
              const event = t.eventId ? eventById.get(t.eventId) : undefined
              return (
                <li key={t.id} className="timeline-item" data-confirmed={event ? true : undefined}>
                  <time className="timeline-time" dateTime={t.at}>
                    {formatTime(t.at)}
                  </time>
                  <div className="timeline-what">
                    {!compact && (
                      <p>
                        <button
                          type="button"
                          className="timeline-device"
                          onClick={() => onSelectDevice(t.deviceId)}
                        >
                          {device?.name ?? t.deviceId}
                        </button>{' '}
                        <span className="secondary">{device?.locality}</span>
                      </p>
                    )}
                    <p className="timeline-kind">
                      {event
                        ? `Cutremurul din ${formatShortTime(event.startedAt)}${event.region ? `, ${event.region}` : ''}`
                        : 'Izolată, neconfirmată de alți senzori'}
                    </p>
                  </div>
                  <p className="timeline-value">
                    {formatNumber(t.peakAccel, 2)}
                    <span className="secondary"> {ACCEL_UNIT}</span>
                  </p>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
