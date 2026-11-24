import type { WidgetStateKind } from '../components/WidgetState'

export interface WaitingState {
  kind: WidgetStateKind
  message: string
}

/** Picks the right state while there is no data yet. */
export function waitingState(apiConfigured: boolean, error: Error | null): WaitingState {
  if (!apiConfigured) return { kind: 'setup', message: 'Fără sursă de date: setează VITE_EVENTS_URL în .env.local.' }
  // The cause is spelled out once, in the system state banner; widgets only point to it.
  if (error) return { kind: 'error', message: 'Date indisponibile: API-ul nu răspunde. Detalii în starea sistemului.' }
  return { kind: 'loading', message: 'Se încarcă' }
}
