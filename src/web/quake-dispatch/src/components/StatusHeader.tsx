import { useNow } from '../hooks/useNow'
import { setTheme, useTheme } from '../hooks/useTheme'
import { formatAccel, formatAgo, formatTime } from '../lib/format'
import type { Event } from '../types'
import './StatusHeader.css'

interface Props {
  activeEvent: Event | null
  /** Shown when no earthquake is active. */
  calmText: string
}

function plainCount(n: number) {
  return n === 1 ? 'Un senzor a depășit pragul' : `${n} senzori au depășit pragul`
}

export function StatusHeader({ activeEvent, calmText }: Props) {
  const alert = activeEvent !== null
  return (
    <header className="status-header" data-alert={alert || undefined}>
      <div className="status-header-brand">
        <Mark />
        <div>
          <p className="status-header-name">quake-dispatch</p>
          <p className="status-header-sub">Rețeaua de senzori seismici</p>
        </div>
      </div>

      <div className="status-header-state" role="status" aria-live="assertive">
        {activeEvent ? (
          <ActiveEvent event={activeEvent} />
        ) : (
          <p className="status-header-calm">{calmText}</p>
        )}
      </div>

      <div className="status-header-end">
        <UtcClock />
        <ThemeToggle />
      </div>
    </header>
  )
}

function ActiveEvent({ event }: { event: Event }) {
  const now = useNow(1000)
  const parts = [
    event.region ?? 'Zonă nedeterminată',
    plainCount(event.deviceIds.length),
    `Accelerație maximă ${formatAccel(event.peakAccel)}`,
    `A început la ${formatTime(event.startedAt)} UTC, ${formatAgo(event.startedAt, now)}`,
  ]
  return (
    <div className="status-header-alert">
      <p className="status-header-alert-title">Cutremur detectat</p>
      <p className="status-header-alert-detail">{parts.join('. ')}.</p>
    </div>
  )
}

function UtcClock() {
  const now = useNow(1000)
  return (
    <p className="status-header-clock">
      <time dateTime={new Date(now).toISOString()}>{formatTime(now)}</time>
      <span className="status-header-clock-zone">UTC</span>
    </p>
  )
}

function ThemeToggle() {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      title={dark ? 'Trece la tema luminoasă' : 'Trece la tema întunecată'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-toggle-icon">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.5" fill="currentColor" />
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
            </g>
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" fill="currentColor" />
        )}
      </svg>
      <span>{dark ? 'Luminos' : 'Întunecat'}</span>
    </button>
  )
}

/** A short seismogram trace. */
function Mark() {
  return (
    <svg className="status-header-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polyline
        points="4,17 9,17 11,13 13,21 15,7 17,26 19,11 21,19 23,15 25,17 28,17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
