import { healthText, type Health } from '../lib/health'
import { levelText, type Level } from '../lib/intensity'
import './StatusBadge.css'

/**
 * Status is always shown as icon shape + text, never by color alone:
 * check = fine, triangle = needs attention, octagon = alert, cross = down.
 */
type Tone = 'ok' | 'warn' | 'alert' | 'down' | 'unknown'

const levelTone: Record<Level, Tone> = { normal: 'ok', elevated: 'warn', alert: 'alert' }
const healthTone: Record<Health, Tone> = { online: 'ok', degraded: 'warn', offline: 'down', unknown: 'unknown' }

export function LevelBadge({ level }: { level: Level }) {
  return <Badge tone={levelTone[level]} text={levelText[level]} />
}

export function HealthBadge({ health }: { health: Health }) {
  return <Badge tone={healthTone[health]} text={healthText[health]} />
}

/** Marks a widget that shows simulated data (see src/api/mock.ts). */
export function DemoBadge({ title }: { title: string }) {
  return (
    <span className="demo-badge" title={title}>
      Date demo
    </span>
  )
}

function Badge({ tone, text }: { tone: Tone; text: string }) {
  return (
    <span className="badge" data-tone={tone}>
      <ToneIcon tone={tone} />
      {text}
    </span>
  )
}

export function ToneIcon({ tone }: { tone: Tone }) {
  return (
    <svg className="badge-icon" viewBox="0 0 16 16" aria-hidden="true">
      {tone === 'ok' && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m4.8 8.2 2.2 2.2 4.2-4.6" fill="none" stroke="var(--badge-on)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {tone === 'warn' && (
        <>
          <path d="M8 1.2 15.2 14.4H.8Z" fill="currentColor" strokeLinejoin="round" />
          <path d="M8 6v3.8" stroke="var(--badge-on)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="12.2" r="1" fill="var(--badge-on)" />
        </>
      )}
      {tone === 'alert' && (
        <>
          <path d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1Z" fill="currentColor" />
          <path d="M8 4.2v4.6" stroke="var(--badge-on)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="1" fill="var(--badge-on)" />
        </>
      )}
      {tone === 'down' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {tone === 'unknown' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" />
          <path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r=".9" fill="currentColor" />
        </>
      )}
    </svg>
  )
}
