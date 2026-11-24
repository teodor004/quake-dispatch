import type { DeviceState } from '../lib/derive'
import './StatusLabel.css'

const text: Record<DeviceState, string> = {
  above: 'Peste prag',
  online: 'Online',
  offline: 'Offline',
}

export function StatusLabel({ state }: { state: DeviceState }) {
  return (
    <span className="status-label" data-state={state}>
      <span className="dot" data-state={state} aria-hidden="true" />
      {text[state]}
    </span>
  )
}
