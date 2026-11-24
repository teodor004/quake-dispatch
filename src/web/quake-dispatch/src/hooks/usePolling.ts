import { startTransition, useEffect, useEffectEvent, useState } from 'react'

export interface PollingState<T> {
  data: T | undefined
  /** Last error; cleared by the next successful response. */
  error: Error | null
  /** Time of the last successful response (client clock, ms). */
  updatedAt: number | null
  /** When the current run of failures began, null while healthy. */
  failingSince: number | null
}

interface Options {
  intervalMs: number
  /** Changing the key discards old data and restarts polling immediately. */
  key?: string
  enabled?: boolean
}

const EMPTY = { data: undefined, error: null, updatedAt: null, failingSince: null }

/**
 * Polls `fetcher` every `intervalMs`.
 *
 * - The next request is scheduled only after the previous one settles, so
 *   slow responses never pile up.
 * - Results are applied in a transition, so a large re-render never blocks
 *   clicks or typing.
 * - Polling stops while the tab is hidden (in-flight request aborted) and
 *   resumes with an immediate fetch when it becomes visible again.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs, key = '', enabled = true }: Options,
): PollingState<T> {
  const [state, setState] = useState<PollingState<T> & { key: string }>({ ...EMPTY, key })
  const fetchLatest = useEffectEvent(fetcher)

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | null = null
    // Bumped whenever a run is cancelled, so a stale run never reschedules.
    let generation = 0
    let disposed = false

    const run = async () => {
      const gen = ++generation
      controller = new AbortController()
      const { signal } = controller
      try {
        const data = await fetchLatest(signal)
        if (gen !== generation || disposed) return
        startTransition(() => {
          setState({ data, error: null, updatedAt: Date.now(), failingSince: null, key })
        })
      } catch (err) {
        if (signal.aborted || gen !== generation || disposed) return
        const error = err instanceof Error ? err : new Error(String(err))
        startTransition(() => {
          setState((s) => ({
            ...(s.key === key ? s : { ...EMPTY, key }),
            error,
            failingSince: s.key === key && s.failingSince ? s.failingSince : Date.now(),
          }))
        })
      }
      if (gen === generation && !disposed && !document.hidden) {
        timer = setTimeout(run, intervalMs)
      }
    }

    const cancel = () => {
      generation += 1
      clearTimeout(timer)
      controller?.abort()
    }

    const onVisibilityChange = () => {
      cancel()
      if (!document.hidden) void run()
    }

    if (!document.hidden) void run()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      cancel()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs, key, enabled])

  // Data from a previous key is never shown for the new one.
  if (state.key !== key) return EMPTY
  return state
}
