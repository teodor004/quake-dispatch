import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { ACCEL_UNIT, HISTORY_WINDOW_S } from '../config'
import { formatAccel, formatDate, formatDateTime, formatNumber, formatShortTime, formatTime } from '../lib/format'
import { usePalette } from '../lib/palette'
import { bucketMax, type SeriesRow } from '../lib/series'
import type { AccelPoint, Event } from '../types'
import './AccelerationChart.css'

interface Props {
  points: AccelPoint[]
  threshold: number
  /** Right edge of the time axis (server clock, ms). */
  end: number
  /** Width of the time axis; defaults to the live 5-minute window. */
  windowMs?: number
  /** Points are reduced to the max of each bucket; 1000 keeps one-second data. */
  bucketMs?: number
  /** Earthquakes to shade on the chart. */
  events?: Event[]
  height: number
  /** Describes the chart for screen readers. */
  label: string
}

type Row = SeriesRow

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Round axis maximum and evenly spaced ticks (0.1, 0.2, 0.25, 0.5, 1, 2…), so labels read cleanly. */
function niceAxis(top: number) {
  const raw = top / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const yMax = Math.ceil(top / step) * step
  const yTicks: number[] = []
  for (let v = 0; v <= yMax + step / 2; v += step) yTicks.push(Math.round(v * 1000) / 1000)
  return { yMax, yTicks }
}

/** Tick spacing and label format for a window, so labels never crowd. */
function axisFor(windowMs: number) {
  if (windowMs <= 10 * MINUTE) return { step: MINUTE, format: formatShortTime }
  if (windowMs <= 2 * HOUR) return { step: 10 * MINUTE, format: formatShortTime }
  if (windowMs <= DAY) return { step: 3 * HOUR, format: formatShortTime }
  return { step: DAY, format: formatDate }
}

export function AccelerationChart({
  points,
  threshold,
  end,
  windowMs = HISTORY_WINDOW_S * 1000,
  bucketMs = 1000,
  events = [],
  height,
  label,
}: Props) {
  const palette = usePalette()
  const start = end - windowMs
  const rows: Row[] = bucketMax(points, bucketMs)
  const axis = axisFor(windowMs)
  const long = windowMs > 2 * HOUR

  let max = 0
  for (const r of rows) if (r.v > max) max = r.v
  // Keep the threshold in the lower half when quiet, grow with the signal.
  const { yMax, yTicks } = niceAxis(Math.max(threshold * 2, max * 1.1))

  const ticks: number[] = []
  for (let t = Math.ceil(start / axis.step) * axis.step; t <= end; t += axis.step) ticks.push(t)

  const spans = events.flatMap((e) => {
    const at = Date.parse(e.startedAt)
    if (at > end || (e.endedAt ? Date.parse(e.endedAt) : end) < start) return []
    const from = Math.max(start, at)
    const to = Math.min(end, e.endedAt ? Date.parse(e.endedAt) : end)
    return [{ id: e.id, from, to, peak: Math.min(e.peakAccel, yMax) }]
  })

  const above = rows.filter((r) => r.v >= threshold).length
  const bucketText = bucketMs <= 1000 ? 'secunde' : 'intervale'

  return (
    <figure className="accel-chart" style={{ height }}>
      <figcaption className="visually-hidden">
        {label}. Prag {formatAccel(threshold)}.{' '}
        {above > 0 ? `${above} ${bucketText} peste prag.` : 'Nicio valoare peste prag.'}{' '}
        {spans.length > 0 ? `${spans.length} cutremure marcate.` : ''}
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={palette.grid} strokeWidth={1} />
          {spans.map((s) => (
            <ReferenceArea
              key={s.id}
              x1={s.from}
              x2={s.to}
              fill={palette.alert}
              fillOpacity={0.12}
              stroke="none"
            />
          ))}
          {/* On long windows an event is thinner than a pixel; a marker keeps it visible. */}
          {spans.map((s) => (
            <ReferenceDot
              key={`dot-${s.id}`}
              x={s.from}
              y={s.peak}
              r={5}
              fill={palette.alert}
              stroke={palette.surface}
              strokeWidth={2}
              ifOverflow="visible"
            />
          ))}
          <XAxis
            dataKey="t"
            type="number"
            domain={[start, end]}
            ticks={ticks}
            tickFormatter={(t: number) => axis.format(t)}
            stroke={palette.rule}
            tick={{ fill: palette.ink2, fontSize: 14 }}
            tickLine={false}
            allowDataOverflow
          />
          <YAxis
            domain={[0, yMax]}
            ticks={yTicks}
            tickFormatter={(v: number) => formatNumber(v, Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : 2)}
            stroke={palette.rule}
            tick={{ fill: palette.ink2, fontSize: 14 }}
            tickLine={false}
            width={44}
            allowDataOverflow
          />
          <ReferenceLine
            y={threshold}
            stroke={palette.threshold}
            strokeWidth={2}
            strokeDasharray="6 4"
            label={{
              value: `prag ${formatNumber(threshold, 2)}`,
              position: 'insideTopRight',
              fill: palette.threshold,
              fontSize: 14,
              fontWeight: 700,
            }}
          />
          <Tooltip
            content={(props) => <ChartTooltip {...props} long={long} />}
            isAnimationActive={false}
            cursor={{ stroke: palette.ink3, strokeWidth: 1 }}
          />
          <Line
            dataKey="v"
            type="linear"
            stroke={palette.trace}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 4, fill: palette.trace, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}

function ChartTooltip({ active, payload, long }: TooltipContentProps<ValueType, NameType> & { long: boolean }) {
  const row = payload?.[0]?.payload as Row | undefined
  if (!active || !row) return null
  return (
    <div className="accel-chart-tip">
      <span>{long ? formatDateTime(row.t) : formatTime(row.t)} UTC</span>
      <strong>
        {formatNumber(row.v, 2)} {ACCEL_UNIT}
      </strong>
    </div>
  )
}
