import { lazy, Suspense, type ComponentProps } from 'react'

// recharts is most of the JavaScript; load it in its own chunk, after the first paint.
const AccelerationChart = lazy(() =>
  import('./AccelerationChart').then((m) => ({ default: m.AccelerationChart })),
)

type Props = ComponentProps<typeof AccelerationChart>

export function LazyAccelerationChart(props: Props) {
  return (
    <Suspense fallback={<div className="placeholder" style={{ height: props.height }}>Se încarcă graficul</div>}>
      <AccelerationChart {...props} />
    </Suspense>
  )
}
