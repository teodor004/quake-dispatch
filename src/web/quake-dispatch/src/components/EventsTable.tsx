import { useState } from 'react'
import { ACCEL_UNIT } from '../config'
import { formatCoords, formatDate, formatDuration, formatNumber, formatTime } from '../lib/format'
import { intensityFromPga } from '../lib/intensity'
import type { Event } from '../types'
import { LevelBadge } from './StatusBadge'
import './EventsTable.css'

interface Props {
  events: Event[]
  serverNow: number
}

type SortKey = 'start' | 'region' | 'intensity' | 'peak' | 'devices' | 'duration'
type Dir = 'asc' | 'desc'

interface Column {
  key: SortKey
  label: string
  numeric?: boolean
  /** Direction used on the first click. */
  first: Dir
}

const COLUMNS: Column[] = [
  { key: 'start', label: 'Început (UTC)', first: 'desc' },
  { key: 'region', label: 'Locație', first: 'asc' },
  { key: 'intensity', label: 'Intensitate est.', first: 'desc' },
  { key: 'peak', label: `PGA max (${ACCEL_UNIT})`, numeric: true, first: 'desc' },
  { key: 'devices', label: 'Senzori', numeric: true, first: 'desc' },
  { key: 'duration', label: 'Durată', numeric: true, first: 'desc' },
]

/** Requirement 2: past earthquakes, sortable by any column. */
export function EventsTable({ events, serverNow }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'start', dir: 'desc' })

  const durationOf = (e: Event) => (e.endedAt ? Date.parse(e.endedAt) : serverNow) - Date.parse(e.startedAt)
  const value = (e: Event, key: SortKey): number | string => {
    switch (key) {
      case 'start':
        return e.startedAt
      case 'region':
        return e.region ?? '￿'
      case 'intensity':
      case 'peak':
        return e.peakAccel
      case 'devices':
        return e.deviceIds.length
      case 'duration':
        return durationOf(e)
    }
  }

  const sign = sort.dir === 'asc' ? 1 : -1
  const ordered = events.toSorted((a, b) => {
    const va = value(a, sort.key)
    const vb = value(b, sort.key)
    const c = typeof va === 'string' ? va.localeCompare(vb as string, 'ro') : va - (vb as number)
    return c * sign || b.startedAt.localeCompare(a.startedAt)
  })

  const toggle = (col: Column) =>
    setSort((s) => (s.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: col.first }))

  return (
    <div className="table-wrap">
      <table className="table events-table">
        <caption className="visually-hidden">
          Cutremure confirmate, sortate după {COLUMNS.find((c) => c.key === sort.key)?.label},{' '}
          {sort.dir === 'asc' ? 'crescător' : 'descrescător'}
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={col.numeric ? 'num' : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-button" data-active={active || undefined} onClick={() => toggle(col)}>
                    {col.label}
                    <SortIcon dir={active ? sort.dir : undefined} />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.map((e) => {
            const active = e.status === 'active'
            const intensity = intensityFromPga(e.peakAccel)
            return (
              <tr key={e.id} data-active={active || undefined}>
                <td className="events-table-time">
                  <span className="secondary">{formatDate(e.startedAt)}</span> {formatTime(e.startedAt)}
                  {active && (
                    <span className="events-table-live">
                      <LevelBadge level="alert" /> în desfășurare
                    </span>
                  )}
                </td>
                <td>
                  {e.region ?? <span className="secondary">nedeterminată</span>}
                  {e.epicenter && <span className="events-table-coords">{formatCoords(e.epicenter)}</span>}
                </td>
                <td>
                  <strong>{intensity.roman}</strong> <span className="secondary">{intensity.description}</span>
                </td>
                <td className="num events-table-peak">{formatNumber(e.peakAccel, 2)}</td>
                <td className="num">{e.deviceIds.length}</td>
                <td className="num">{formatDuration(durationOf(e))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SortIcon({ dir }: { dir: Dir | undefined }) {
  return (
    <svg className="sort-icon" viewBox="0 0 10 14" aria-hidden="true" data-dir={dir}>
      <path className="sort-up" d="M5 1 9 6H1Z" />
      <path className="sort-down" d="M5 13 1 8h8Z" />
    </svg>
  )
}
